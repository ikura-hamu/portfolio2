<script setup lang="ts">
/**
 * Post list.
 *
 * Shows posts on `main` together with the `post/*` working branches, so a
 * draft written on another device is visible here. Offline, the local drafts
 * are authoritative and the last fetched list is shown as a cached reference.
 */
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { api, errorMessage } from "@/lib/admin/api";
import {
  NEW_DRAFT_KEY,
  cachePostList,
  deleteDraft,
  getCachedPostList,
  isDraftStorageAvailable,
  listDrafts,
  type Draft,
} from "@/lib/admin/draftStore";
import type { PostSummary } from "@/lib/backend/types";

const props = defineProps<{ isLocal: boolean; online: boolean }>();
const emit = defineEmits<{
  (event: "toast", message: string, kind?: "error" | "info"): void;
}>();

const router = useRouter();
const posts = ref<PostSummary[]>([]);
const drafts = ref<Draft[]>([]);
const loading = ref(true);
const fromCache = ref(false);
const draftStorageOk = ref(true);
const newDraft = ref<Draft | undefined>();
const error = ref("");
const menuFor = ref<string | null>(null);

interface Row {
  /**
   * Unique per row. The in-progress new post uses `NEW_DRAFT_KEY`, because its
   * slug may still be empty or collide with an existing post's.
   */
  key: string;
  slug: string;
  title: string;
  pubDate?: string;
  state: "main-only" | "branch-ahead" | "draft-only" | "local-only" | "new";
  aheadBy: number;
  behindBy: number;
  hasLocalDraft: boolean;
  onMain: boolean;
}

const rows = computed<Row[]>(() => {
  const localBySlug = new Map(drafts.value.map((draft) => [draft.slug, draft]));
  const merged: Row[] = posts.value.map((post) => ({
    key: post.slug,
    slug: post.slug,
    title: post.title,
    pubDate: post.pubDate,
    state: post.branchState,
    aheadBy: post.aheadBy,
    behindBy: post.behindBy,
    hasLocalDraft: localBySlug.has(post.slug),
    onMain: post.onMain,
  }));

  // Drafts that only exist in this browser.
  for (const draft of drafts.value) {
    if (merged.some((row) => row.slug === draft.slug)) continue;
    merged.push({
      key: draft.key,
      slug: draft.slug,
      title: draft.frontmatter.title || draft.slug,
      pubDate: draft.frontmatter.pubDate,
      state: "local-only",
      aheadBy: 0,
      behindBy: 0,
      hasLocalDraft: true,
      onMain: false,
    });
  }
  if (newDraft.value) {
    merged.unshift({
      key: NEW_DRAFT_KEY,
      slug: newDraft.value.slug,
      title: newDraft.value.frontmatter.title || "（無題の新規記事）",
      pubDate: newDraft.value.frontmatter.pubDate,
      state: "new",
      aheadBy: 0,
      behindBy: 0,
      hasLocalDraft: true,
      onMain: false,
    });
  }
  return merged;
});

const STATE_LABEL: Record<Row["state"], string> = {
  "main-only": "main のみ",
  "branch-ahead": "作業ブランチあり",
  "draft-only": "未公開の下書き",
  "local-only": "ローカル下書きのみ",
  new: "作成中（未保存）",
};

async function load() {
  loading.value = true;
  error.value = "";
  const allDrafts = await listDrafts();
  newDraft.value = allDrafts.find((draft) => draft.key === NEW_DRAFT_KEY);
  drafts.value = allDrafts.filter((draft) => draft.key !== NEW_DRAFT_KEY);
  draftStorageOk.value = await isDraftStorageAvailable();

  try {
    const fetched = await api.listPosts();
    posts.value = fetched;
    fromCache.value = false;
    await cachePostList(fetched);
  } catch (caught) {
    posts.value = await getCachedPostList();
    fromCache.value = true;
    error.value = errorMessage(
      caught,
      "オフラインです。最後に取得した一覧を表示しています。",
    );
  } finally {
    loading.value = false;
  }
}

function open(row: Row) {
  if (row.state === "new") {
    router.push("/admin/new");
    return;
  }
  router.push({ name: "edit", params: { slug: row.slug } });
}

async function discard(row: Row) {
  menuFor.value = null;

  if (row.state === "new") {
    if (!confirm("作成中の新規記事を破棄しますか？")) return;
    await deleteDraft(NEW_DRAFT_KEY);
    emit("toast", "作成中の下書きを破棄しました。");
    await load();
    return;
  }

  if (!confirm(`下書き「${row.title}」を破棄しますか？`)) return;

  try {
    // The working branch goes first: if discarding it fails, the local edits
    // are still there to retry with.
    if (!props.isLocal && row.state !== "local-only") {
      const result = await api.discardDraft(row.slug);
      if (!result.ok) {
        emit("toast", result.reason ?? "破棄できませんでした。", "error");
        return;
      }
    }
    await deleteDraft(row.key);
    emit("toast", "下書きを破棄しました。");
    await load();
  } catch (caught) {
    emit("toast", errorMessage(caught), "error");
  }
}

function formatDate(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("ja-JP", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

/** The row menu closes on a press anywhere outside it, or on Escape. */
function closeMenuOnOutsidePress(event: PointerEvent) {
  if (menuFor.value === null) return;
  const target = event.target as Element | null;
  if (!target?.closest("[data-row-menu]")) menuFor.value = null;
}

function closeMenuOnEscape(event: KeyboardEvent) {
  if (event.key === "Escape") menuFor.value = null;
}

onMounted(() => {
  document.addEventListener("pointerdown", closeMenuOnOutsidePress);
  document.addEventListener("keydown", closeMenuOnEscape);
  void load();
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", closeMenuOnOutsidePress);
  document.removeEventListener("keydown", closeMenuOnEscape);
});
</script>

<template>
  <div class="mx-auto flex w-full max-w-3xl flex-col gap-3 p-3">
    <div class="flex items-center gap-2">
      <h1 class="text-lg font-bold">記事一覧</h1>
      <span class="grow" />
      <button
        type="button"
        class="rounded border px-2 py-1 text-sm disabled:opacity-50"
        :disabled="loading || !online"
        @click="load"
      >
        再取得
      </button>
      <button
        type="button"
        class="rounded bg-primary px-3 py-1 text-sm text-white"
        @click="router.push('/admin/new')"
      >
        新規記事
      </button>
    </div>

    <p v-if="error" class="rounded bg-amber-100 p-2 text-sm text-amber-900">
      {{ error }}
    </p>

    <p
      v-if="!draftStorageOk"
      class="rounded bg-red-100 p-2 text-sm text-red-800"
    >
      この環境では IndexedDB
      を利用できないため、編集中の内容は自動保存されません。
    </p>

    <p v-if="loading" class="text-sm opacity-70">読み込み中…</p>

    <ul v-else class="admin-divide flex flex-col">
      <li
        v-for="row in rows"
        :key="row.key"
        class="flex items-center gap-2 py-2"
      >
        <button
          type="button"
          class="flex min-w-0 grow flex-col items-start text-left"
          @click="open(row)"
        >
          <span class="w-full truncate font-medium">{{ row.title }}</span>
          <span class="flex flex-wrap items-center gap-2 text-xs opacity-70">
            <code v-if="row.slug">{{ row.slug }}</code>
            <span>{{ formatDate(row.pubDate) }}</span>
          </span>
        </button>

        <div class="flex shrink-0 flex-wrap items-center gap-1">
          <span
            v-if="!isLocal || row.state === 'new'"
            class="rounded px-2 py-0.5 text-xs"
            :class="{
              'bg-neutral-200 text-neutral-700': row.state === 'main-only',
              'bg-blue-100 text-blue-800': row.state === 'branch-ahead',
              'bg-amber-100 text-amber-900': row.state === 'draft-only',
              'bg-purple-100 text-purple-900':
                row.state === 'local-only' || row.state === 'new',
            }"
          >
            {{ STATE_LABEL[row.state] }}
          </span>
          <span
            v-if="!isLocal && row.behindBy > 0"
            class="rounded bg-red-100 px-2 py-0.5 text-xs text-red-800"
            :title="`main から ${row.behindBy} commit 遅れています`"
          >
            main -{{ row.behindBy }}
          </span>
          <span
            v-if="row.hasLocalDraft"
            class="rounded bg-purple-100 px-2 py-0.5 text-xs text-purple-900"
          >
            未保存
          </span>
        </div>

        <div class="relative shrink-0" data-row-menu>
          <button
            type="button"
            class="rounded px-2 py-1 text-sm"
            aria-label="操作"
            @click="menuFor = menuFor === row.key ? null : row.key"
          >
            …
          </button>
          <div
            v-if="menuFor === row.key"
            class="admin-surface admin-border absolute right-0 z-20 mt-1 w-48 rounded border p-1 shadow-lg"
          >
            <button
              type="button"
              class="admin-hover w-full rounded px-2 py-1 text-left text-sm"
              @click="open(row)"
            >
              編集
            </button>
            <button
              v-if="!row.onMain"
              type="button"
              class="admin-hover w-full rounded px-2 py-1 text-left text-sm text-red-700"
              @click="discard(row)"
            >
              下書きを破棄
            </button>
          </div>
        </div>
      </li>
    </ul>

    <p v-if="!loading && rows.length === 0" class="text-sm opacity-70">
      記事がありません。
    </p>
    <p v-if="fromCache" class="text-xs opacity-60">
      （キャッシュされた一覧を表示しています）
    </p>
  </div>
</template>
