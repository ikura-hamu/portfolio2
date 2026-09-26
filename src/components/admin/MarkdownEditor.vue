<script setup lang="ts">
/**
 * CodeMirror 6 markdown editor.
 *
 * The toolbar sits above the editor rather than above the soft keyboard: it
 * works the same on every browser, which matters because this is also used
 * from a phone.
 */
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { EditorState, type Extension } from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
} from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import {
  syntaxHighlighting,
  defaultHighlightStyle,
} from "@codemirror/language";
import { oneDark } from "@codemirror/theme-one-dark";

const props = defineProps<{ modelValue: string }>();
const emit = defineEmits<{
  (event: "update:modelValue", value: string): void;
  (event: "request-image"): void;
  (event: "files", files: File[]): void;
}>();

const host = ref<HTMLDivElement>();
const view = shallowRef<EditorView>();
const isDark = ref(false);
const dragging = ref(false);

/** Wraps the selection, or inserts the markers at the cursor. */
function surround(before: string, after = before) {
  const editor = view.value;
  if (!editor) return;
  const { from, to } = editor.state.selection.main;
  const selected = editor.state.sliceDoc(from, to);
  editor.dispatch({
    changes: { from, to, insert: `${before}${selected}${after}` },
    selection: {
      anchor: from + before.length,
      head: from + before.length + selected.length,
    },
  });
  editor.focus();
}

/** Applies a prefix to every line the selection touches. */
function prefixLines(prefix: string) {
  const editor = view.value;
  if (!editor) return;
  const { from, to } = editor.state.selection.main;
  const first = editor.state.doc.lineAt(from).number;
  const last = editor.state.doc.lineAt(to).number;
  const changes = [];
  for (let number = first; number <= last; number += 1) {
    const line = editor.state.doc.line(number);
    changes.push({ from: line.from, to: line.from, insert: prefix });
  }
  editor.dispatch({ changes });
  editor.focus();
}

function insert(text: string) {
  const editor = view.value;
  if (!editor) return;
  const { from, to } = editor.state.selection.main;
  editor.dispatch({
    changes: { from, to, insert: text },
    selection: { anchor: from + text.length },
  });
  editor.focus();
}

/** Inserts markdown image syntax at the cursor; used after an upload. */
function insertImage(reference: string, alt: string) {
  insert(`![${alt}](${reference})`);
}
defineExpose({ insertImage });

/** The image files among those pasted or dropped; anything else is ignored. */
function imageFiles(list: FileList | undefined): File[] {
  return [...(list ?? [])].filter((file) => file.type.startsWith("image/"));
}

function baseExtensions(): Extension[] {
  return [
    lineNumbers(),
    highlightActiveLine(),
    history(),
    keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
    markdown({ base: markdownLanguage, codeLanguages: [] }),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    EditorView.lineWrapping,
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        emit("update:modelValue", update.state.doc.toString());
      }
    }),
    EditorView.theme({
      "&": { fontSize: "16px" },
      // The page scrolls, so the editor grows instead of scrolling inside.
      ".cm-content": { minHeight: "60vh" },
      ".cm-scroller": {
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Noto Sans JP', monospace",
        lineHeight: "1.7",
      },
    }),
    EditorView.domEventHandlers({
      paste(event) {
        const files = imageFiles(event.clipboardData?.files);
        if (files.length === 0) return false;
        event.preventDefault();
        emit("files", files);
        return true;
      },
      drop(event) {
        const files = imageFiles(event.dataTransfer?.files);
        dragging.value = false;
        if (files.length === 0) return false;
        event.preventDefault();
        emit("files", files);
        return true;
      },
      dragover(event) {
        if (event.dataTransfer?.types.includes("Files")) {
          event.preventDefault();
          dragging.value = true;
        }
        return false;
      },
      dragleave() {
        dragging.value = false;
        return false;
      },
    }),
  ];
}

function buildState(doc: string) {
  return EditorState.create({
    doc,
    extensions: isDark.value
      ? [...baseExtensions(), oneDark]
      : baseExtensions(),
  });
}

let themeObserver: MutationObserver | undefined;

onMounted(() => {
  isDark.value = document.documentElement.getAttribute("data-theme") === "dark";
  view.value = new EditorView({
    state: buildState(props.modelValue),
    parent: host.value!,
  });

  // The public site stores the theme on <html data-theme>; follow it.
  themeObserver = new MutationObserver(() => {
    const dark = document.documentElement.getAttribute("data-theme") === "dark";
    if (dark === isDark.value) return;
    isDark.value = dark;
    view.value?.setState(buildState(view.value.state.doc.toString()));
  });
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
});

onBeforeUnmount(() => {
  themeObserver?.disconnect();
  view.value?.destroy();
});

// External changes (loading another post, restoring a draft) replace the doc.
watch(
  () => props.modelValue,
  (value) => {
    const editor = view.value;
    if (!editor || editor.state.doc.toString() === value) return;
    editor.dispatch({
      changes: { from: 0, to: editor.state.doc.length, insert: value },
    });
  },
);
</script>

<template>
  <div class="flex flex-col">
    <!-- Sits just below the editor's sticky actions bar; see PostEditor. -->
    <div
      class="admin-surface admin-border sticky z-10 flex gap-1 overflow-x-auto border-b p-1"
      style="top: var(--admin-sticky-top, 0px)"
    >
      <button
        type="button"
        class="tb admin-hover"
        title="見出し2"
        @click="prefixLines('## ')"
      >
        H2
      </button>
      <button
        type="button"
        class="tb admin-hover"
        title="見出し3"
        @click="prefixLines('### ')"
      >
        H3
      </button>
      <button
        type="button"
        class="tb admin-hover font-bold"
        title="太字"
        @click="surround('**')"
      >
        B
      </button>
      <button
        type="button"
        class="tb admin-hover italic"
        title="斜体"
        @click="surround('*')"
      >
        I
      </button>
      <button
        type="button"
        class="tb admin-hover"
        title="リンク"
        @click="surround('[', '](url)')"
      >
        🔗
      </button>
      <button
        type="button"
        class="tb admin-hover"
        title="インラインコード"
        @click="surround('`')"
      >
        &lt;/&gt;
      </button>
      <button
        type="button"
        class="tb admin-hover"
        title="コードブロック"
        @click="insert('\n```\n\n```\n')"
      >
        ```
      </button>
      <button
        type="button"
        class="tb admin-hover"
        title="箇条書き"
        @click="prefixLines('- ')"
      >
        •
      </button>
      <button
        type="button"
        class="tb admin-hover"
        title="引用"
        @click="prefixLines('> ')"
      >
        ❝
      </button>
      <button
        type="button"
        class="tb admin-hover"
        title="画像を追加"
        @click="emit('request-image')"
      >
        🖼
      </button>
    </div>
    <div ref="host" :class="dragging ? 'ring-2 ring-primary ring-inset' : ''" />
  </div>
</template>

<style scoped>
.tb {
  flex: none;
  min-width: 2.25rem;
  padding: 0.35rem 0.5rem;
  border-radius: 0.375rem;
  font-size: 0.85rem;
  line-height: 1;
  border: 1px solid transparent;
}
.tb:active {
  background-color: color-mix(in srgb, currentColor 20%, transparent);
}
</style>
