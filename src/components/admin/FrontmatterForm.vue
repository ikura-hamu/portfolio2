<script setup lang="ts">
/**
 * Schema-driven frontmatter form with a raw YAML escape hatch for keys the
 * form does not cover. Saving normalizes the YAML, so comments in existing
 * posts are lost on their first save through the admin UI.
 */
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { parse as parseYAML, stringify as stringifyYAML } from "yaml";
import { errorMessage } from "@/lib/admin/api";
import { prepareImage, type PreparedImage } from "@/lib/admin/imagePipeline";
import { sanitizeImageName } from "@/lib/contentPaths";
import type { Frontmatter } from "@/lib/post";

const props = defineProps<{
  modelValue: Frontmatter;
  slug: string;
  slugEditable: boolean;
  titleWarning: boolean;
  /** File names the post's images already use, so a new one cannot clash. */
  takenImageNames: ReadonlySet<string>;
}>();
const emit = defineEmits<{
  (event: "update:modelValue", value: Frontmatter): void;
  (event: "update:slug", value: string): void;
  /** A hero image to queue for the next save, named and ready to commit. */
  (event: "hero-image", image: PreparedImage): void;
}>();

const rawMode = ref(false);
const rawText = ref("");
const rawError = ref("");
const tagInput = ref("");

function patch(patchValue: Partial<Frontmatter>) {
  emit("update:modelValue", { ...props.modelValue, ...patchValue });
}

/** Keys the form does not render, shown so they are not silently invisible. */
const extraKeys = computed(() =>
  Object.keys(props.modelValue).filter(
    (key) =>
      ![
        "title",
        "description",
        "pubDate",
        "updatedDate",
        "heroImage",
        "heroImageContent",
        "tags",
      ].includes(key),
  ),
);

const tags = computed(() => props.modelValue.tags ?? []);

function addTag() {
  const value = tagInput.value.trim();
  if (!value || tags.value.includes(value)) {
    tagInput.value = "";
    return;
  }
  patch({ tags: [...tags.value, value] });
  tagInput.value = "";
}

function removeTag(tag: string) {
  patch({ tags: tags.value.filter((t) => t !== tag) });
}

/** `<input type="datetime-local">` needs local time without an offset. */
function toLocalInput(iso: string | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromLocalInput(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function enterRawMode() {
  rawText.value = stringifyYAML(props.modelValue, { lineWidth: 0 });
  rawError.value = "";
  rawMode.value = true;
}

function applyRaw() {
  try {
    const parsed = parseYAML(rawText.value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      rawError.value = "YAML のマッピングを入力してください。";
      return;
    }
    const normalized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(parsed)) {
      normalized[key] = value instanceof Date ? value.toISOString() : value;
    }
    if (typeof normalized.title !== "string") {
      rawError.value = "title は必須で、文字列である必要があります。";
      return;
    }
    emit("update:modelValue", normalized as Frontmatter);
    rawError.value = "";
    rawMode.value = false;
  } catch (error) {
    rawError.value = errorMessage(error);
  }
}

/**
 * Uploading a hero image under a chosen name. The image goes through the same
 * pipeline as the ones dropped into the body before the name is asked for,
 * because conversion decides the extension; only the part before it is
 * editable.
 */
const heroFileInput = ref<HTMLInputElement>();
const heroUpload = ref<{
  blob: Blob;
  stem: string;
  extension: string;
  previewUrl: string;
} | null>(null);
const heroPreparing = ref(false);
const heroUploadError = ref("");

/** The name the image will be committed as, or null if it is unusable. */
const heroSavedName = computed(() => {
  const upload = heroUpload.value;
  if (!upload || upload.stem.trim() === "") return null;
  try {
    return sanitizeImageName(`${upload.stem.trim()}${upload.extension}`);
  } catch {
    return null;
  }
});

async function onHeroFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  cancelHeroUpload();
  heroPreparing.value = true;
  try {
    const prepared = await prepareImage(file);
    const extension = /\.[^.]+$/.exec(prepared.name)?.[0] ?? "";
    heroUpload.value = {
      blob: prepared.blob,
      stem: prepared.name.slice(0, prepared.name.length - extension.length),
      extension,
      previewUrl: URL.createObjectURL(prepared.blob),
    };
  } catch (error) {
    heroUploadError.value = `画像を処理できませんでした: ${errorMessage(error)}`;
  } finally {
    heroPreparing.value = false;
  }
}

/**
 * A clash is reported rather than renamed around: the author picked this
 * name on purpose.
 */
function confirmHeroUpload() {
  const upload = heroUpload.value;
  const name = heroSavedName.value;
  if (!upload) return;
  if (!name) {
    heroUploadError.value = "ファイル名が空か、使えない名前です。";
    return;
  }
  if (props.takenImageNames.has(name)) {
    heroUploadError.value = `「${name}」はこの記事の画像で使われています。別の名前にしてください。`;
    return;
  }
  emit("hero-image", { name, blob: upload.blob });
  cancelHeroUpload();
}

function cancelHeroUpload() {
  if (heroUpload.value) URL.revokeObjectURL(heroUpload.value.previewUrl);
  heroUpload.value = null;
  heroUploadError.value = "";
}

onBeforeUnmount(cancelHeroUpload);

watch(
  () => props.modelValue,
  () => {
    if (rawMode.value) return;
    rawError.value = "";
  },
);
</script>

<template>
  <div class="flex flex-col gap-3 p-3">
    <div class="flex items-center justify-between">
      <h2 class="text-sm font-bold">frontmatter</h2>
      <button
        type="button"
        class="rounded border px-2 py-1 text-xs"
        @click="rawMode ? (rawMode = false) : enterRawMode()"
      >
        {{ rawMode ? "フォームに戻る" : "raw YAML" }}
      </button>
    </div>

    <template v-if="rawMode">
      <textarea
        v-model="rawText"
        rows="14"
        spellcheck="false"
        class="w-full rounded border p-2 font-mono text-sm"
      />
      <p v-if="rawError" class="text-sm text-red-600">{{ rawError }}</p>
      <button
        type="button"
        class="self-start rounded bg-primary px-3 py-1 text-sm text-white"
        @click="applyRaw"
      >
        YAML を反映
      </button>
    </template>

    <template v-else>
      <label class="flex flex-col gap-1 text-sm">
        <span class="font-medium">slug</span>
        <input
          :value="slug"
          :disabled="!slugEditable"
          placeholder="260924_go-conference-26-proposal"
          class="rounded border p-2 font-mono disabled:opacity-60"
          @input="
            emit('update:slug', ($event.target as HTMLInputElement).value)
          "
        />
        <span v-if="slugEditable" class="text-xs opacity-70">
          URL になります。作成後は変更できません。使えるのは小文字英数字と - _
          です。
        </span>
        <span v-else class="text-xs opacity-70">
          作成後の slug は変更できません（URL と giscus
          のコメントが切れるため）。
        </span>
      </label>

      <label class="flex flex-col gap-1 text-sm">
        <span class="font-medium"
          >title <span class="text-red-600">*</span></span
        >
        <input
          :value="modelValue.title"
          class="rounded border p-2"
          @input="patch({ title: ($event.target as HTMLInputElement).value })"
        />
        <span v-if="titleWarning" class="text-xs text-amber-600">
          タイトルを変更すると giscus
          のコメントスレッドが切れます（data-mapping="title" のため）。
        </span>
      </label>

      <label class="flex flex-col gap-1 text-sm">
        <span class="font-medium">description</span>
        <textarea
          :value="modelValue.description ?? ''"
          rows="2"
          class="rounded border p-2"
          @input="
            patch({
              description:
                ($event.target as HTMLTextAreaElement).value || undefined,
            })
          "
        />
      </label>

      <div class="grid gap-3 sm:grid-cols-2">
        <label class="flex flex-col gap-1 text-sm">
          <span class="font-medium">pubDate</span>
          <input
            type="datetime-local"
            :value="toLocalInput(modelValue.pubDate)"
            class="rounded border p-2"
            @input="
              patch({
                pubDate: fromLocalInput(
                  ($event.target as HTMLInputElement).value,
                ),
              })
            "
          />
        </label>
        <label class="flex flex-col gap-1 text-sm">
          <span class="font-medium">updatedDate</span>
          <input
            type="datetime-local"
            :value="toLocalInput(modelValue.updatedDate)"
            class="rounded border p-2"
            @input="
              patch({
                updatedDate: fromLocalInput(
                  ($event.target as HTMLInputElement).value,
                ),
              })
            "
          />
        </label>
      </div>

      <div class="flex flex-col gap-1 text-sm">
        <span class="font-medium">tags</span>
        <div class="flex flex-wrap gap-1">
          <span
            v-for="tag in tags"
            :key="tag"
            class="flex items-center gap-1 rounded bg-primary/10 px-2 py-1 text-xs"
          >
            #{{ tag }}
            <button type="button" class="opacity-60" @click="removeTag(tag)">
              ×
            </button>
          </span>
        </div>
        <input
          v-model="tagInput"
          placeholder="タグを入力して Enter"
          class="rounded border p-2"
          @keydown.enter.prevent="addTag"
        />
      </div>

      <div class="flex flex-col gap-1 text-sm">
        <label class="flex flex-col gap-1">
          <span class="font-medium">heroImageContent（アイキャッチ）</span>
          <input
            :value="modelValue.heroImageContent ?? ''"
            placeholder="./hero.webp"
            class="rounded border p-2 font-mono"
            @input="
              patch({
                heroImageContent:
                  ($event.target as HTMLInputElement).value || undefined,
              })
            "
          />
        </label>
        <span class="text-xs opacity-70">
          記事からの相対パス。OGP 画像にもこれが使われます。
        </span>

        <input
          ref="heroFileInput"
          type="file"
          accept="image/*"
          class="hidden"
          @change="onHeroFile"
        />
        <button
          v-if="!heroUpload"
          type="button"
          class="self-start rounded border px-2 py-1 text-xs disabled:opacity-50"
          :disabled="heroPreparing"
          @click="heroFileInput?.click()"
        >
          {{ heroPreparing ? "画像を処理中…" : "画像をアップロード" }}
        </button>

        <div v-else class="admin-border flex flex-col gap-2 rounded border p-2">
          <img
            :src="heroUpload.previewUrl"
            alt=""
            class="max-h-40 self-start rounded object-contain"
          />
          <label class="flex flex-col gap-1">
            <span class="font-medium">ファイル名</span>
            <span class="flex items-center gap-1">
              <input
                v-model="heroUpload.stem"
                class="min-w-0 flex-1 rounded border p-2 font-mono"
                @keydown.enter.prevent="confirmHeroUpload"
              />
              <span class="font-mono opacity-70">{{
                heroUpload.extension
              }}</span>
            </span>
          </label>
          <span v-if="heroSavedName" class="text-xs opacity-70">
            保存名: <code>{{ heroSavedName }}</code
            >（追加すると本文の画像と同じく次の保存で commit されます）
          </span>
          <div class="flex gap-2">
            <button
              type="button"
              class="rounded bg-primary px-3 py-1 text-xs text-white"
              @click="confirmHeroUpload"
            >
              追加
            </button>
            <button
              type="button"
              class="rounded border px-2 py-1 text-xs"
              @click="cancelHeroUpload"
            >
              キャンセル
            </button>
          </div>
        </div>
        <p v-if="heroUploadError" class="text-xs text-red-600">
          {{ heroUploadError }}
        </p>
      </div>

      <p v-if="extraKeys.length > 0" class="text-xs opacity-70">
        フォーム外のキー: {{ extraKeys.join(", ") }}（raw YAML で編集できます）
      </p>
    </template>
  </div>
</template>
