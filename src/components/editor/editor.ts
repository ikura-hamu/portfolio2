import { EditorState } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  undo,
  redo,
  insertNewlineAndIndent,
} from "@codemirror/commands";
import { markdown, markdownKeymap } from "@codemirror/lang-markdown";
import {
  defaultHighlightStyle,
  syntaxHighlighting,
} from "@codemirror/language";
import {
  newDocument,
  splitDocument,
  updateMetadata,
  validateDocument,
  validSlug,
  type Draft,
} from "../../lib/editor/document";
import { drafts, persist } from "../../lib/editor/storage";

const element = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const input = (id: string) => element<HTMLInputElement>(id);
const button = (id: string) => element<HTMLButtonElement>(id);

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
async function api<T>(action: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/editor/${action}`, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(45000),
  });
  const result = await response.json();
  if (!response.ok)
    throw new ApiError(
      response.status,
      result.error ?? "GitHubに接続できませんでした。",
    );
  return result;
}

export function startEditor() {
  let draft: Draft | undefined;
  let view: EditorView | undefined;
  let localTimestamp: number | null = null;
  let localFailure = false;
  let queue = Promise.resolve();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let activeTab = "source";
  let previewVersion = 0;
  let remoteConflict: { sha: string; source: string } | null = null;
  let busy = false;
  let metadataSource = "";
  const message = (text: string) => {
    element("message").textContent = text;
    element("message").hidden = !text;
    requestAnimationFrame(resize);
  };
  function report(error: unknown) {
    message(
      error instanceof Error
        ? error.message
        : "処理に失敗しました。原稿をダウンロードして保管してください。",
    );
    if (error instanceof ApiError && error.status === 401)
      element("login-again").hidden = false;
  }
  function status() {
    if (!draft) return;
    element("remote-status").textContent =
      draft.source === draft.savedSource
        ? "GitHubに保存済み"
        : "GitHubに未保存";
    element("character-count").textContent =
      `${draft.source.length.toLocaleString()}文字`;
  }
  function storeLocal(): Promise<void> {
    clearTimeout(timer);
    if (!draft) return queue;
    const active = draft;
    const task = queue.then(async () => {
      if (active !== draft) return;
      const timestamp = Math.max(Date.now(), (localTimestamp ?? 0) + 1);
      const snapshot = { ...active, updatedAt: timestamp };
      await persist(snapshot, localTimestamp);
      localTimestamp = timestamp;
      active.updatedAt = timestamp;
      localFailure = false;
      element("local-status").textContent =
        active.source === snapshot.source ? "端末に保存済み" : "端末に保存中…";
    });
    queue = task.catch((error) => {
      localFailure = true;
      element("local-status").textContent = "端末内保存に失敗";
      report(error);
    });
    return task;
  }
  function changed() {
    if (!draft || !view) return;
    draft.source = view.state.doc.toString();
    element("local-status").textContent = "端末に保存中…";
    status();
    clearTimeout(timer);
    timer = setTimeout(() => {
      void storeLocal().catch(() => {});
    }, 300);
  }
  async function renderPreview() {
    if (!draft) return;
    const version = ++previewVersion;
    const snapshot = { ...draft };
    element("preview-content").textContent = "プレビューを準備しています…";
    try {
      const { preview } = await import("../../lib/editor/preview");
      const html = await preview(
        snapshot.source,
        snapshot.path,
        snapshot.branch,
      );
      if (version === previewVersion && draft?.branch === snapshot.branch)
        element("preview-content").innerHTML = html;
    } catch (error) {
      if (version === previewVersion)
        element("preview-content").textContent =
          error instanceof Error
            ? error.message
            : "プレビューを生成できませんでした。";
    }
  }
  function settings() {
    if (!draft) return;
    const { data } = splitDocument(draft.source);
    metadataSource = draft.source;
    for (const name of [
      "title",
      "description",
      "pubDate",
      "updatedDate",
      "heroImage",
      "heroImageContent",
    ])
      input(`meta-${name}`).value = String(data[name] ?? "");
    input("meta-tags").value = Array.isArray(data.tags)
      ? data.tags.join(", ")
      : "";
  }
  function applySettings() {
    if (!draft || !view || activeTab !== "settings") return;
    const { data } = splitDocument(metadataSource);
    const changes: Record<string, string | string[] | undefined> = {};
    for (const name of [
      "title",
      "description",
      "pubDate",
      "updatedDate",
      "heroImage",
      "heroImageContent",
    ]) {
      const value = input(`meta-${name}`).value;
      if (value !== String(data[name] ?? ""))
        changes[name] = value || undefined;
    }
    const tags = input("meta-tags").value;
    if (tags !== (Array.isArray(data.tags) ? data.tags.join(", ") : ""))
      changes.tags = tags
        ? tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean)
        : undefined;
    const source = updateMetadata(draft.source, changes);
    if (source !== draft.source)
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: source },
      });
    metadataSource = source;
  }
  function tab(name: string) {
    applySettings();
    if (name === "settings") settings();
    activeTab = name;
    for (const item of ["source", "settings", "preview"]) {
      element(`panel-${item}`).hidden = name !== item;
      element(`tab-${item}`).setAttribute(
        "aria-selected",
        String(name === item),
      );
      element(`tab-${item}`).tabIndex = name === item ? 0 : -1;
    }
    if (name === "preview") void renderPreview();
    if (name === "source") view?.requestMeasure();
  }
  async function activate(next: Draft, existingLocal: boolean) {
    if (draft) {
      applySettings();
      await storeLocal();
    }
    draft = next;
    localTimestamp = existingLocal ? next.updatedAt : null;
    view?.destroy();
    activeTab = "source";
    view = new EditorView({
      parent: element("markdown-editor"),
      state: EditorState.create({
        doc: next.source,
        extensions: [
          history(),
          markdown(),
          syntaxHighlighting(defaultHighlightStyle),
          EditorView.lineWrapping,
          keymap.of([
            ...markdownKeymap,
            ...defaultKeymap,
            ...historyKeymap,
            { key: "Enter", run: insertNewlineAndIndent },
          ]),
          placeholder("ここから書き始める"),
          EditorView.contentAttributes.of({
            "aria-label": "記事のMarkdown",
            "aria-multiline": "true",
            spellcheck: "false",
            autocapitalize: "off",
            autocorrect: "off",
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) changed();
          }),
        ],
      }),
    });
    element("library").hidden = true;
    element("workspace").hidden = false;
    element("document-name").textContent = next.path.replace(
      "src/content/blog/",
      "",
    );
    element("document-name").title = `${next.path}\n${next.branch}`;
    const link = element<HTMLAnchorElement>("github-link");
    link.href = `https://github.com/ikura-hamu/portfolio2/tree/${encodeURIComponent(next.branch)}`;
    link.title = next.branch;
    status();
    tab("source");
    message("");
    await storeLocal();
  }
  function listButton(
    list: HTMLElement,
    title: string,
    detail: string,
    action: () => Promise<void>,
  ) {
    const li = document.createElement("li");
    const item = document.createElement("button");
    item.type = "button";
    const label = document.createElement("strong");
    label.textContent = title;
    const small = document.createElement("span");
    small.textContent = detail;
    item.append(label, small);
    li.append(item);
    list.append(li);
    item.addEventListener("click", () => void run(action));
  }
  async function localList() {
    const items = await drafts();
    const list = element("draft-list");
    list.replaceChildren();
    if (!items.length)
      list.textContent = "この端末に保存した原稿はありません。";
    for (const item of items) {
      let title = item.path.replace("src/content/blog/", "");
      try {
        title = String(splitDocument(item.source).data.title || title);
      } catch {
        /* A malformed draft must still be recoverable. */
      }
      listButton(
        list,
        title,
        `${item.source === item.savedSource ? "GitHubに保存済み" : "GitHubに未保存"} · ${new Date(item.updatedAt).toLocaleString("ja-JP")}`,
        async () => activate(item, true),
      );
    }
  }
  async function remoteList() {
    const select = element<HTMLSelectElement>("branch-select");
    const selected = select.value;
    const result = await api<{ paths: string[] }>(
      `list?branch=${encodeURIComponent(selected)}`,
    );
    if (select.value !== selected) return;
    const list = element("article-list");
    list.replaceChildren();
    if (!result.paths.length) list.textContent = "記事はありません。";
    for (const path of result.paths)
      listButton(
        list,
        path.replace("src/content/blog/", ""),
        selected === "main" ? "作業ブランチを作成して編集" : selected,
        async () => {
          const items = await drafts();
          const local =
            selected === "main"
              ? undefined
              : items.find(
                  (item) => item.branch === selected && item.path === path,
                );
          if (local) return activate(local, true);
          if (
            selected !== "main" &&
            items.some((item) => item.branch === selected && item.path !== path)
          )
            throw new Error(
              "このブランチには別の記事の原稿があります。別の記事はmainから編集を始めてください。",
            );
          const result =
            selected === "main"
              ? await api<{
                  path: string;
                  branch: string;
                  sha: string;
                  source: string;
                }>("start", { path })
              : {
                  path,
                  branch: selected,
                  ...(await api<{ source: string; sha: string } | null>(
                    `read?path=${encodeURIComponent(path)}&branch=${encodeURIComponent(selected)}`,
                  )),
                };
          if (!result.source || !result.sha)
            throw new Error(
              "記事が見つかりません。記事一覧を再取得してください。",
            );
          await activate(
            {
              ...result,
              source: result.source,
              sha: result.sha,
              savedSource: result.source,
              updatedAt: Date.now(),
            },
            false,
          );
        },
      );
  }
  async function refresh() {
    await localList();
    const { branches } = await api<{ branches: string[] }>("branches");
    const select = element<HTMLSelectElement>("branch-select");
    const current = select.value;
    select.replaceChildren(
      new Option("main（公開用）", "main"),
      ...branches.map((branch) => new Option(branch, branch)),
    );
    if (branches.includes(current)) select.value = current;
    await remoteList();
  }
  async function run(action: () => Promise<void>) {
    if (busy) return;
    busy = true;
    button("save").disabled = true;
    button("back").disabled = true;
    message("");
    try {
      await action();
    } catch (error) {
      report(error);
    } finally {
      busy = false;
      button("save").disabled = false;
      button("back").disabled = false;
    }
  }
  async function conflict() {
    if (!draft) return;
    remoteConflict = await api<{ sha: string; source: string } | null>(
      `read?path=${encodeURIComponent(draft.path)}&branch=${encodeURIComponent(draft.branch)}`,
    );
    element("conflict-local").textContent = draft.source;
    element("conflict-remote").textContent =
      remoteConflict?.source ?? "GitHub側にファイルがありません。";
    element<HTMLDialogElement>("conflict-dialog").showModal();
  }
  async function save() {
    if (!draft) return;
    applySettings();
    validateDocument(draft.source);
    await storeLocal();
    const snapshot = { ...draft };
    element("remote-status").textContent = "GitHubに保存中…";
    try {
      const result = await api<{ sha: string }>("save", {
        path: snapshot.path,
        branch: snapshot.branch,
        source: snapshot.source,
        sha: snapshot.sha,
      });
      draft.sha = result.sha;
      draft.savedSource = snapshot.source;
      await storeLocal();
      message("作業ブランチに保存しました。");
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) await conflict();
      else throw error;
    } finally {
      status();
    }
  }
  element<HTMLFormElement>("new-form").addEventListener("submit", (event) => {
    event.preventDefault();
    void run(async () => {
      const slug = input("new-slug").value.trim();
      const title = input("new-title").value.trim();
      if (!validSlug(slug) || !title)
        throw new Error("タイトルと有効なslugを入力してください。");
      const result = await api<{ path: string; branch: string; sha: null }>(
        "start",
        { slug },
      );
      await activate(
        {
          ...result,
          source: newDocument(title),
          savedSource: null,
          updatedAt: Date.now(),
        },
        false,
      );
    });
  });
  element<HTMLFormElement>("settings-form").addEventListener(
    "submit",
    (event) => {
      event.preventDefault();
      try {
        applySettings();
        tab("source");
        void storeLocal().catch(report);
      } catch (error) {
        report(error);
      }
    },
  );
  for (const name of ["source", "settings", "preview"]) {
    button(`tab-${name}`).addEventListener("click", () => {
      try {
        tab(name);
      } catch (error) {
        report(error);
      }
    });
    button(`tab-${name}`).addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
        return;
      event.preventDefault();
      const names = ["source", "settings", "preview"];
      const index = names.indexOf(name);
      const next =
        event.key === "Home"
          ? "source"
          : event.key === "End"
            ? "preview"
            : names[(index + (event.key === "ArrowRight" ? 1 : 2)) % 3];
      try {
        tab(next);
        button(`tab-${next}`).focus();
      } catch (error) {
        report(error);
      }
    });
  }
  document
    .querySelectorAll<HTMLButtonElement>("[data-insert]")
    .forEach((item) => {
      item.addEventListener("pointerdown", (event) => event.preventDefault());
      item.addEventListener("click", () => {
        if (!view || view.composing) return;
        const range = view.state.selection.main;
        const selected = view.state.sliceDoc(range.from, range.to);
        const inserts: Record<string, [string, string, string]> = {
          heading: ["## ", "", "見出し"],
          bold: ["**", "**", "太字"],
          link: ["[", "](https://)", "リンク名"],
          list: ["- ", "", "項目"],
          code: ["\n```\n", "\n```\n", "コード"],
        };
        const [before, after, fallback] = inserts[item.dataset.insert!];
        const text = selected || fallback;
        view.dispatch({
          changes: {
            from: range.from,
            to: range.to,
            insert: before + text + after,
          },
          selection: {
            anchor: range.from + before.length,
            head: range.from + before.length + text.length,
          },
          scrollIntoView: true,
        });
        view.focus();
      });
    });
  for (const [id, command] of [
    ["undo", undo],
    ["redo", redo],
  ] as const) {
    button(id).addEventListener("pointerdown", (event) =>
      event.preventDefault(),
    );
    button(id).addEventListener("click", () => {
      if (view && !view.composing) {
        command(view);
        view.focus();
      }
    });
  }
  button("save").addEventListener("click", () => void run(save));
  button("back").addEventListener(
    "click",
    () =>
      void run(async () => {
        applySettings();
        await storeLocal();
        view?.destroy();
        view = undefined;
        draft = undefined;
        element("workspace").hidden = true;
        element("library").hidden = false;
        await refresh();
      }),
  );
  button("refresh").addEventListener("click", () => void run(refresh));
  element("branch-select").addEventListener(
    "change",
    () => void run(remoteList),
  );
  button("download").addEventListener("click", () => {
    if (!draft) return;
    try {
      applySettings();
    } catch (error) {
      report(error);
    }
    const url = URL.createObjectURL(
      new Blob([draft.source], { type: "text/markdown;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = draft.path
      .replace("src/content/blog/", "")
      .replace("/index.md", ".md");
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  button("conflict-close").addEventListener("click", () =>
    element<HTMLDialogElement>("conflict-dialog").close(),
  );
  button("conflict-resolve").addEventListener(
    "click",
    () =>
      void run(async () => {
        if (!draft) return;
        draft.sha = remoteConflict?.sha ?? null;
        draft.savedSource = remoteConflict?.source ?? null;
        await storeLocal();
        status();
        element<HTMLDialogElement>("conflict-dialog").close();
        message(
          "現在の本文を解決結果にしました。確認後にブランチへ保存してください。",
        );
      }),
  );
  element<HTMLFormElement>("logout-form").addEventListener(
    "submit",
    (event) => {
      event.preventDefault();
      if (busy) return;
      void run(async () => {
        applySettings();
        await storeLocal();
        const response = await fetch("/api/editor/auth/logout", {
          method: "POST",
          credentials: "same-origin",
        });
        if (!response.ok) throw new Error("ログアウトできませんでした。");
        location.href = "/admin/editor";
      });
    },
  );
  const network = () => {
    element("connection").textContent = navigator.onLine ? "" : "オフライン";
  };
  window.addEventListener("online", network);
  window.addEventListener("offline", network);
  network();
  window.addEventListener("beforeunload", (event) => {
    if (
      draft &&
      (draft.source !== draft.savedSource ||
        localFailure ||
        activeTab === "settings")
    ) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      try {
        applySettings();
        void storeLocal().catch(report);
      } catch (error) {
        report(error);
      }
    }
  });
  function resize() {
    const height = window.visualViewport?.height ?? window.innerHeight;
    document.documentElement.style.setProperty(
      "--viewport-height",
      `${height}px`,
    );
    const workspace = element("workspace");
    if (!workspace.hidden) {
      const top =
        workspace.getBoundingClientRect().top -
        (window.visualViewport?.offsetTop ?? 0);
      workspace.style.height = `${Math.max(220, height - Math.max(0, top))}px`;
      view?.requestMeasure();
    }
  }
  window.visualViewport?.addEventListener("resize", resize);
  window.addEventListener("resize", resize);
  resize();
  void run(refresh);
}
