<script setup lang="ts">
/**
 * CodeMirror 6 markdown editor.
 *
 * The toolbar sits above the editor rather than above the soft keyboard: it
 * works the same on every browser, which matters because this is also used
 * from a phone.
 */
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import {
  EditorSelection,
  EditorState,
  type ChangeSpec,
  type Extension,
  type SelectionRange,
} from "@codemirror/state";
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

/**
 * Applies an edit to every selection range and focuses the editor.
 * `changeByRange` takes each range's changes and its new selection in the
 * range's own coordinates and maps them onto each other, so the cursor lands
 * where the helper says instead of wherever position mapping leaves it.
 */
function edit(
  apply: (
    range: SelectionRange,
    state: EditorState,
  ) => {
    changes: ChangeSpec;
    range: SelectionRange;
  },
) {
  const editor = view.value;
  if (!editor) return;
  editor.dispatch(
    editor.state.changeByRange((range) => apply(range, editor.state)),
    { scrollIntoView: true, userEvent: "input" },
  );
  editor.focus();
}

/** Wraps the selection, or puts the cursor between the markers. */
function surround(before: string, after = before) {
  edit(({ from, to }) => ({
    changes: [
      { from, insert: before },
      { from: to, insert: after },
    ],
    range: EditorSelection.range(from + before.length, to + before.length),
  }));
}

/**
 * Makes the selection a link and selects the `url` placeholder, so typing
 * replaces it. With nothing selected, the cursor goes where the text goes.
 */
function insertLink() {
  edit(({ from, to }) => {
    const urlStart = to + "[](".length;
    return {
      changes: [
        { from, insert: "[" },
        { from: to, insert: "](url)" },
      ],
      range:
        from === to
          ? EditorSelection.cursor(from + 1)
          : EditorSelection.range(urlStart, urlStart + "url".length),
    };
  });
}

/**
 * Rewrites the start of every line the selection touches. Blank lines are
 * left alone when several lines are selected. Positions are mapped with
 * `assoc = 1`, so a cursor at the start of a line ends up after the new
 * prefix rather than before it.
 */
function editLineStarts(
  rewrite: (text: string) => { remove: number; insert: string },
) {
  edit((range, state) => {
    const first = state.doc.lineAt(range.from).number;
    const last = state.doc.lineAt(range.to).number;
    const specs = [];
    for (let number = first; number <= last; number += 1) {
      const line = state.doc.line(number);
      if (first !== last && line.text.trim() === "") continue;
      const { remove, insert } = rewrite(line.text);
      specs.push({ from: line.from, to: line.from + remove, insert });
    }
    const changes = state.changes(specs);
    return {
      changes,
      range: EditorSelection.range(
        changes.mapPos(range.anchor, 1),
        changes.mapPos(range.head, 1),
      ),
    };
  });
}

/** Adds a prefix such as `- ` or `> ` to each line. */
function prefixLines(prefix: string) {
  editLineStarts(() => ({ remove: 0, insert: prefix }));
}

/**
 * Sets the heading level of each line, replacing any existing `#` prefix.
 * A line already at that level goes back to plain text.
 */
function setHeading(level: number) {
  const marker = `${"#".repeat(level)} `;
  editLineStarts((text) => {
    const current = /^#{1,6} /.exec(text)?.[0] ?? "";
    return {
      remove: current.length,
      insert: current === marker ? "" : marker,
    };
  });
}

/**
 * Fences the selected text, or inserts an empty fence with the cursor on
 * its blank line. The fences always sit on lines of their own.
 */
function insertCodeBlock() {
  edit(({ from, to }, state) => {
    const lead = from === state.doc.lineAt(from).from ? "" : "\n";
    const trail = to === state.doc.lineAt(to).to ? "" : "\n";
    const selected = state.sliceDoc(from, to);
    const opening = `${lead}\`\`\`\n`;
    return {
      changes: {
        from,
        to,
        insert: `${opening}${selected}\n\`\`\`${trail}`,
      },
      range: EditorSelection.range(
        from + opening.length,
        from + opening.length + selected.length,
      ),
    };
  });
}

function insert(text: string) {
  edit(({ from, to }) => ({
    changes: { from, to, insert: text },
    range: EditorSelection.cursor(from + text.length),
  }));
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
        @click="setHeading(2)"
      >
        H2
      </button>
      <button
        type="button"
        class="tb admin-hover"
        title="見出し3"
        @click="setHeading(3)"
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
        @click="insertLink"
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
        @click="insertCodeBlock"
      >
        ```
      </button>
      <button
        type="button"
        class="tb admin-hover"
        title="箇条書き"
        @click="prefixLines('- ')"
      >
        ・
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
