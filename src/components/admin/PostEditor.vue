<script setup lang="ts">
/**
 * The editing screen.
 *
 * Edits live in IndexedDB from the first keystroke; pushing them to GitHub is
 * an explicit action that creates or reuses the `post/<slug>` branch.
 */
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  toRaw,
  watch,
} from "vue";
import { useRoute, useRouter } from "vue-router";
import MarkdownEditor from "./MarkdownEditor.vue";
import MarkdownPreview from "./MarkdownPreview.vue";
import FrontmatterForm from "./FrontmatterForm.vue";
import { api, errorMessage } from "@/lib/admin/api";
import {
  NEW_DRAFT_KEY,
  deleteDraft,
  getDraft,
  putDraft,
  type Draft,
  type PendingImage,
} from "@/lib/admin/draftStore";
import { blobToBase64, prepareImage } from "@/lib/admin/imagePipeline";
import type { Frontmatter, PostLayout } from "@/lib/post";
import { imageTarget, isValidSlug } from "@/lib/contentPaths";

const props = defineProps<{ isLocal: boolean; online: boolean }>();
const emit = defineEmits<{
  (event: "toast", message: string, kind?: "error" | "info"): void;
}>();

const route = useRoute();
const router = useRouter();

const isNew = computed(() => route.name === "new");
const slug = ref("");
const layout = ref<PostLayout>("directory");
const frontmatter = ref<Frontmatter>({ title: "" });
const body = ref("");
const pendingImages = ref<PendingImage[]>([]);
const committedImages = ref<{ path: string; reference: string }[]>([]);
const deletions = ref<string[]>([]);
const baseSha = ref("");
const originalTitle = ref("");

const loading = ref(true);
const saving = ref(false);
const loadError = ref("");
const conflict = ref<{ remoteSha: string } | null>(null);
/**
 * Which pane the top tabs show. "body" and "preview" sit side by side from
 * `md` up, so on a wide screen those two tabs differ only on narrow widths;
 * "meta" always takes the full width.
 */
const tab = ref<"body" | "preview" | "meta">("body");

const editorRef = ref<InstanceType<typeof MarkdownEditor>>();
const fileInput = ref<HTMLInputElement>();
const stickyRef = ref<HTMLElement>();
const root = ref<HTMLElement>();

/**
 * The editor toolbar sticks below the actions bar, whose height changes when
 * the header wraps on a narrow screen, so it is measured rather than assumed.
 */
let stickyObserver: ResizeObserver | undefined;

onMounted(() => {
  if (typeof ResizeObserver === "undefined" || !stickyRef.value) return;
  stickyObserver = new ResizeObserver(([entry]) => {
    root.value?.style.setProperty(
      "--admin-sticky-top",
      `${Math.round(entry.contentRect.height)}px`,
    );
  });
  stickyObserver.observe(stickyRef.value);
});

const objectUrls = new Map<string, string>();

/** Maps a markdown image reference to a blob URL for images not yet committed. */
const resolveImage = computed(() => {
  const map = new Map<string, string>();
  for (const image of pendingImages.value) {
    let url = objectUrls.get(image.reference);
    if (!url) {
      url = URL.createObjectURL(image.blob);
      objectUrls.set(image.reference, url);
    }
    map.set(image.reference, url);
  }
  return (reference: string) => map.get(reference);
});

const titleWarning = computed(
  () =>
    !isNew.value &&
    originalTitle.value !== "" &&
    frontmatter.value.title !== originalTitle.value,
);

const slugError = computed(() => {
  if (!isNew.value) return "";
  if (slug.value === "") return "slug を入力してください。";
  if (!isValidSlug(slug.value)) {
    return "slug は小文字英数字と - _ のみ使用できます。";
  }
  return "";
});

const canSave = computed(
  () =>
    !saving.value &&
    frontmatter.value.title.trim() !== "" &&
    slugError.value === "" &&
    // The local backend writes to disk, so being offline does not matter there.
    (props.online || props.isLocal),
);

/**
 * The key a draft is stored under. A new post uses a fixed key because its
 * slug can still change while it is being written, and a key derived from the
 * slug would scatter one draft across several entries.
 */
function draftKey(): string {
  return isNew.value ? NEW_DRAFT_KEY : slug.value;
}

/**
 * A copy with Vue's reactive proxies stripped at every level. IndexedDB
 * structured-clones what it stores and cannot clone a Proxy; Blobs and other
 * non-plain objects are kept as they are.
 */
function plain<T>(value: T): T {
  const raw = toRaw(value);
  if (Array.isArray(raw)) return raw.map(plain) as T;
  if (raw !== null && typeof raw === "object") {
    const proto = Object.getPrototypeOf(raw);
    if (proto === Object.prototype || proto === null) {
      return Object.fromEntries(
        Object.entries(raw).map(([key, item]) => [key, plain(item)]),
      ) as T;
    }
  }
  return raw;
}

function toDraft(key: string): Draft {
  return plain({
    slug: key,
    layout: layout.value,
    isNew: key === NEW_DRAFT_KEY,
    frontmatter: frontmatter.value,
    body: body.value,
    pendingImages: pendingImages.value,
    deletions: deletions.value,
    committedImages: committedImages.value,
    baseSha: baseSha.value,
    updatedAt: Date.now(),
  });
}

function applyPost(post: Awaited<ReturnType<typeof api.getPost>>) {
  layout.value = post.layout;
  frontmatter.value = post.frontmatter;
  body.value = post.body;
  committedImages.value = post.images;
  baseSha.value = post.baseSha;
  originalTitle.value = post.frontmatter.title;
}

function applyDraft(draft: Draft) {
  slug.value = draft.slug;
  layout.value = draft.layout;
  frontmatter.value = draft.frontmatter;
  body.value = draft.body;
  pendingImages.value = draft.pendingImages;
  deletions.value = draft.deletions;
  committedImages.value = draft.committedImages;
  baseSha.value = draft.baseSha;
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
/**
 * The key the pending save belongs to, fixed when the edit is made. By the
 * time the save runs the route may already point at another post.
 */
let pendingKey: string | undefined;
/** Set while state is replaced programmatically, which is not an edit. */
let suppressLocalSave = false;
/** Reported once per run of failures rather than on every keystroke. */
let localSaveFailed = false;
/** Counts edits, so a save can tell whether any were made while it ran. */
let editCount = 0;

/** 500ms after the last keystroke the draft is written to IndexedDB. */
function scheduleLocalSave() {
  if (loading.value || suppressLocalSave) return;
  editCount += 1;
  clearTimeout(saveTimer);
  pendingKey = draftKey();
  saveTimer = setTimeout(() => void flushLocalSave(), 500);
}

function cancelLocalSave() {
  clearTimeout(saveTimer);
  pendingKey = undefined;
}

/**
 * Writes the pending save now. The draft is built before the first `await`,
 * so callers can reset the state right after calling this.
 */
async function flushLocalSave() {
  const key = pendingKey;
  cancelLocalSave();
  if (key === undefined) return;
  const draft = toDraft(key);
  try {
    await putDraft(draft);
    localSaveFailed = false;
  } catch (error) {
    console.error(error);
    if (!localSaveFailed) {
      localSaveFailed = true;
      emit(
        "toast",
        `下書きをこの端末に保存できませんでした: ${errorMessage(error)}`,
        "error",
      );
    }
  }
}

/**
 * Replaces the state without it counting as an edit. The watcher below runs
 * on the next flush, so the flag stays up until then.
 */
async function replaceState(apply: () => void) {
  suppressLocalSave = true;
  try {
    apply();
    await nextTick();
  } finally {
    suppressLocalSave = false;
  }
}

watch([frontmatter, body, pendingImages, deletions, slug], scheduleLocalSave, {
  deep: true,
});

/**
 * `/admin/new` and `/admin/edit/:slug` are the same component, so Vue Router
 * reuses the instance. Everything is reset here; leaving state behind would
 * carry one post's unsaved images or pending deletions into another's commit.
 */
function resetState() {
  slug.value = "";
  layout.value = "directory";
  frontmatter.value = { title: "" };
  body.value = "";
  for (const url of objectUrls.values()) URL.revokeObjectURL(url);
  objectUrls.clear();
  pendingImages.value = [];
  committedImages.value = [];
  deletions.value = [];
  baseSha.value = "";
  originalTitle.value = "";
  conflict.value = null;
  loadError.value = "";
  tab.value = "body";
}

async function load() {
  // An edit made just before leaving belongs to the post being left.
  void flushLocalSave();
  loading.value = true;
  resetState();
  try {
    await loadContent();
  } finally {
    // The watcher sees the loaded state on the next flush; that is not an
    // edit, so `loading` stays up until it has run.
    await nextTick();
    loading.value = false;
  }
}

async function loadContent() {
  if (isNew.value) {
    const draft = await getDraft(NEW_DRAFT_KEY);
    if (draft) {
      applyDraft(draft);
    } else {
      frontmatter.value = { title: "", pubDate: new Date().toISOString() };
    }
    return;
  }

  const target = String(route.params.slug ?? "");
  slug.value = target;

  // A local draft is always newer than what the server has, so it wins.
  const draft = await getDraft(target);
  if (draft) {
    applyDraft(draft);
    originalTitle.value = draft.frontmatter.title;
    if (props.online) void refreshFromServer(true);
    return;
  }

  try {
    const post = await api.getPost(target);
    applyPost(post);
  } catch (error) {
    loadError.value = errorMessage(
      error,
      "オフラインのため、この記事はローカルに下書きがないと開けません。",
    );
  }
}

/** Pulls the latest state from GitHub, discarding local edits when asked. */
async function refreshFromServer(silent = false) {
  if (isNew.value) return;
  try {
    const post = await api.getPost(slug.value);
    if (silent) {
      // Only refresh the conflict baseline; the editor content is untouched.
      if (post.baseSha !== baseSha.value && baseSha.value !== "") {
        conflict.value = { remoteSha: post.baseSha };
      }
      return;
    }
    cancelLocalSave();
    await replaceState(() => {
      applyPost(post);
      pendingImages.value = [];
      deletions.value = [];
      conflict.value = null;
    });
    await deleteDraft(slug.value);
    emit("toast", "GitHub の最新状態を取得しました。");
  } catch (error) {
    emit("toast", errorMessage(error), "error");
  }
}

async function addFiles(files: File[]) {
  for (const file of files) {
    try {
      const prepared = await prepareImage(file);
      const name = uniqueName(prepared.name);
      const { reference } = imageTarget(
        slug.value || "draft",
        layout.value,
        name,
      );
      pendingImages.value = [
        ...pendingImages.value,
        { name, reference, blob: prepared.blob },
      ];
      editorRef.value?.insertImage(
        reference,
        prepared.name.replace(/\.[^.]+$/, ""),
      );
    } catch (error) {
      emit(
        "toast",
        `画像を処理できませんでした: ${errorMessage(error)}`,
        "error",
      );
    }
  }
}

function uniqueName(name: string): string {
  const taken = new Set([
    ...pendingImages.value.map((image) => image.name),
    ...committedImages.value.map((image) => image.path.split("/").pop() ?? ""),
  ]);
  if (!taken.has(name)) return name;
  const stem = name.replace(/\.[^.]+$/, "");
  const ext = name.slice(stem.length);
  let index = 2;
  while (taken.has(`${stem}-${index}${ext}`)) index += 1;
  return `${stem}-${index}${ext}`;
}

function onFileInput(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = [...(input.files ?? [])];
  input.value = "";
  if (files.length > 0) void addFiles(files);
}

async function save(force = false) {
  if (!canSave.value) return;
  if (!props.online && !props.isLocal) {
    emit("toast", "オフラインのため GitHub に保存できません。", "error");
    return;
  }

  saving.value = true;
  const editsBefore = editCount;
  try {
    const images = await Promise.all(
      pendingImages.value.map(async (image) => ({
        name: image.name,
        contentBase64: await blobToBase64(image.blob),
      })),
    );
    const input = {
      slug: slug.value,
      layout: layout.value,
      frontmatter: frontmatter.value,
      body: body.value,
      images,
      deletions: deletions.value,
      baseSha: force ? "" : baseSha.value,
    };

    const result = isNew.value
      ? await api.createPost(input)
      : await api.updatePost(input);

    if (!result.ok && result.reason === "conflict") {
      conflict.value = { remoteSha: result.remoteSha };
      emit(
        "toast",
        "作業ブランチが他から進んでいます。対応を選んでください。",
        "error",
      );
      return;
    }
    if (!result.ok && result.reason === "exists") {
      emit("toast", `slug "${slug.value}" は既に存在します。`, "error");
      return;
    }
    if (!result.ok) {
      emit("toast", "保存できませんでした。", "error");
      return;
    }

    // Edits made while the request was in flight are not in this commit, so
    // their draft is kept; otherwise the saved state needs no draft.
    const editedMeanwhile = editCount !== editsBefore;
    await replaceState(() => {
      baseSha.value = result.commitSha;
      pendingImages.value = [];
      deletions.value = [];
      conflict.value = null;
      committedImages.value = [...committedImages.value, ...result.images];
      originalTitle.value = frontmatter.value.title;
    });

    if (isNew.value) {
      // The post exists now, so the new-post slot is freed and edits made
      // meanwhile are saved under the post's own key instead.
      if (editedMeanwhile) pendingKey = slug.value;
      await deleteDraft(NEW_DRAFT_KEY);
    } else if (!editedMeanwhile) {
      await deleteDraft(slug.value);
    }
    emit(
      "toast",
      props.isLocal
        ? "ローカルのファイルに保存しました。"
        : `${result.branch} に commit しました（main は変更されていません）。`,
    );

    if (isNew.value) {
      await router.replace({ name: "edit", params: { slug: slug.value } });
    }
  } catch (error) {
    emit("toast", errorMessage(error), "error");
  } finally {
    saving.value = false;
  }
}

function removePendingImage(reference: string) {
  pendingImages.value = pendingImages.value.filter(
    (image) => image.reference !== reference,
  );
  const url = objectUrls.get(reference);
  if (url) {
    URL.revokeObjectURL(url);
    objectUrls.delete(reference);
  }
}

function removeCommittedImage(path: string) {
  deletions.value = [...deletions.value, path];
  committedImages.value = committedImages.value.filter(
    (image) => image.path !== path,
  );
}

onMounted(load);
watch(() => route.fullPath, load);

onBeforeUnmount(() => {
  stickyObserver?.disconnect();
  void flushLocalSave();
  for (const url of objectUrls.values()) URL.revokeObjectURL(url);
  objectUrls.clear();
});
</script>

<template>
  <div ref="root" class="flex flex-col">
    <!-- The page itself scrolls, so the actions and tabs stick to the top.
         Their measured height feeds `--admin-sticky-top`, which the editor
         toolbar sits below. -->
    <div
      ref="stickyRef"
      class="admin-surface admin-border sticky top-0 z-30 border-b"
    >
      <header class="flex flex-wrap items-center gap-2 px-3 py-2">
        <button
          type="button"
          class="rounded border px-2 py-1 text-sm"
          @click="router.push('/admin/')"
        >
          ← 一覧
        </button>
        <span class="min-w-0 flex-1 truncate text-sm font-bold">
          {{ frontmatter.title || (isNew ? "新規記事" : slug) }}
        </span>
        <button
          v-if="!isNew"
          type="button"
          class="rounded border px-2 py-1 text-sm disabled:opacity-50"
          :disabled="!online"
          @click="refreshFromServer(false)"
        >
          再取得
        </button>
        <button
          type="button"
          class="rounded bg-primary px-3 py-1 text-sm text-white disabled:opacity-50"
          :disabled="!canSave"
          @click="save(false)"
        >
          {{ saving ? "保存中…" : "保存" }}
        </button>
      </header>

      <p
        v-if="loadError"
        class="m-3 rounded bg-red-100 p-3 text-sm text-red-800"
      >
        {{ loadError }}
      </p>

      <div
        v-if="conflict"
        class="m-3 flex flex-col gap-2 rounded bg-amber-100 p-3 text-sm text-amber-900"
      >
        <p>
          作業ブランチが別の場所から更新されています（リモート:
          {{ conflict.remoteSha.slice(0, 7) }}）。 自動マージは行いません。
        </p>
        <div class="flex gap-2">
          <button
            type="button"
            class="rounded border px-2 py-1"
            @click="save(true)"
          >
            手元の内容で上書きする
          </button>
          <button
            type="button"
            class="rounded border px-2 py-1"
            @click="refreshFromServer(false)"
          >
            ローカルを破棄して再取得する
          </button>
        </div>
      </div>

      <div v-if="slugError" class="mx-3 text-sm text-red-600">
        {{ slugError }}
      </div>

      <!-- Switching between writing and the metadata form. -->
      <nav class="flex gap-1 p-1">
        <button
          type="button"
          class="flex-1 rounded px-2 py-1 text-sm"
          :class="tab === 'body' ? 'bg-primary text-white' : ''"
          @click="tab = 'body'"
        >
          本文
        </button>
        <!-- From md up the preview sits beside the editor, so this is only
           needed on narrow screens. -->
        <button
          type="button"
          class="flex-1 rounded px-2 py-1 text-sm md:hidden"
          :class="tab === 'preview' ? 'bg-primary text-white' : ''"
          @click="tab = 'preview'"
        >
          プレビュー
        </button>
        <button
          type="button"
          class="flex-1 rounded px-2 py-1 text-sm"
          :class="tab === 'meta' ? 'bg-primary text-white' : ''"
          @click="tab = 'meta'"
        >
          メタデータ
        </button>
      </nav>
    </div>

    <div v-if="loading" class="p-6 text-sm opacity-70">読み込み中…</div>

    <div v-else class="flex flex-col md:flex-row">
      <section
        class="admin-border w-full flex-col md:w-1/2 md:border-r"
        :class="
          tab === 'body'
            ? 'flex'
            : tab === 'preview'
              ? 'hidden md:flex'
              : 'hidden'
        "
      >
        <MarkdownEditor
          ref="editorRef"
          v-model="body"
          @files="addFiles"
          @request-image="fileInput?.click()"
        />
        <input
          ref="fileInput"
          type="file"
          accept="image/*"
          multiple
          class="hidden"
          @change="onFileInput"
        />
        <div
          v-if="pendingImages.length > 0 || committedImages.length > 0"
          class="admin-border border-t p-2 text-xs"
        >
          <p class="mb-1 font-bold">画像</p>
          <ul class="flex flex-col gap-1">
            <li
              v-for="image in pendingImages"
              :key="image.reference"
              class="flex items-center gap-2"
            >
              <span class="rounded bg-amber-200 px-1 text-amber-900"
                >未保存</span
              >
              <code class="truncate">{{ image.reference }}</code>
              <button
                type="button"
                class="opacity-60"
                @click="removePendingImage(image.reference)"
              >
                ×
              </button>
            </li>
            <li
              v-for="image in committedImages"
              :key="image.path"
              class="flex items-center gap-2"
            >
              <code class="truncate">{{ image.reference }}</code>
              <button
                type="button"
                class="opacity-60"
                @click="removeCommittedImage(image.path)"
              >
                ×
              </button>
            </li>
          </ul>
        </div>
      </section>

      <section
        class="w-full md:w-1/2"
        :class="
          tab === 'preview'
            ? 'block'
            : tab === 'body'
              ? 'hidden md:block'
              : 'hidden'
        "
      >
        <MarkdownPreview :body="body" :resolve-image="resolveImage" />
      </section>

      <aside class="w-full" :class="tab === 'meta' ? 'block' : 'hidden'">
        <div class="mx-auto w-full max-w-2xl">
          <FrontmatterForm
            v-model="frontmatter"
            v-model:slug="slug"
            :slug-editable="isNew"
            :title-warning="titleWarning"
          />
        </div>
      </aside>
    </div>
  </div>
</template>
