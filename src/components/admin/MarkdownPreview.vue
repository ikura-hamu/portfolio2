<script setup lang="ts">
/**
 * Renders the body with the remark plugins shared with production.
 * Link cards need a network fetch, so they appear as a placeholder here.
 *
 * The result goes through `v-html` because the pipeline keeps raw HTML, which
 * posts rely on. That is safe only because the only author is the signed-in
 * owner editing their own posts; nothing here renders third-party markdown.
 */
import { ref, watch } from "vue";
import { errorMessage } from "@/lib/admin/api";
import {
  escapeHTML,
  renderPreview,
  type ImageResolver,
} from "@/lib/admin/preview";

const props = defineProps<{ body: string; resolveImage: ImageResolver }>();
const html = ref("");
let token = 0;

async function render() {
  const current = ++token;
  try {
    const result = await renderPreview(props.body, props.resolveImage);
    if (current === token) html.value = result;
  } catch (error) {
    if (current === token) {
      html.value = `<p class="admin-preview-error">プレビューを描画できませんでした: ${escapeHTML(
        errorMessage(error),
      )}</p>`;
    }
  }
}

watch(() => props.body, render, { immediate: true });
watch(() => props.resolveImage, render);
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -- see the note at the top -->
  <div class="prose admin-preview" v-html="html" />
</template>

<style>
.admin-preview {
  padding: 1rem;
}
.admin-link-card-placeholder {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.75rem 1rem;
  border: 1px dashed currentColor;
  border-radius: 0.5rem;
  opacity: 0.75;
  word-break: break-all;
}
.admin-link-card-placeholder__label {
  font-size: 0.75rem;
  opacity: 0.8;
}
.admin-preview img[data-unresolved] {
  display: inline-block;
  min-width: 8rem;
  min-height: 3rem;
  padding: 0.75rem;
  border: 1px dashed currentColor;
  border-radius: 0.5rem;
  opacity: 0.7;
  font-size: 0.8rem;
}
.admin-preview-error {
  color: #b91c1c;
}
</style>
