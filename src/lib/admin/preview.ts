/**
 * Browser-side markdown preview.
 *
 * It reuses the remark plugins shared with the production pipeline
 * (`src/lib/markdown/shared.mjs`), so headings, line breaks and the table of
 * contents behave the same. `remark-link-card-plus` fetches OGP metadata over
 * the network and cannot run here, so standalone URLs render as a placeholder
 * instead. Preview is therefore close to production, not identical.
 */
import { unified, type Plugin } from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeStringify from "rehype-stringify";
import { visit } from "unist-util-visit";
import type { Root as MdastRoot, RootContent, PhrasingContent } from "mdast";
import type { Root as HastRoot, Element } from "hast";
import { sharedRemarkPlugins } from "../markdown/shared.mjs";

/** Resolves a markdown image reference to something the browser can display. */
export type ImageResolver = (reference: string) => string | undefined;

export function escapeHTML(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function normalizeHTTPURL(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

/** Reads the URL out of a paragraph that contains nothing but a link. */
function standaloneURL(child: PhrasingContent): string | undefined {
  if (child.type === "text") return normalizeHTTPURL(child.value);
  if (
    child.type === "link" &&
    child.children.length === 1 &&
    child.children[0].type === "text"
  ) {
    const target = normalizeHTTPURL(child.url);
    const label = normalizeHTTPURL(child.children[0].value);
    return target === label ? target : undefined;
  }
  return undefined;
}

/**
 * Mirrors the detection in `src/plugins/remark-link-card-show-url.mjs` and
 * replaces the paragraph with a placeholder, since the real card needs a fetch.
 */
const remarkLinkCardPlaceholder: Plugin<[], MdastRoot> = () => {
  return (tree) => {
    for (let index = 0; index < tree.children.length; index += 1) {
      const node = tree.children[index];
      if (node.type !== "paragraph" || node.children.length !== 1) continue;

      const url = standaloneURL(node.children[0]);
      if (!url) continue;

      const escaped = escapeHTML(url);
      tree.children[index] = {
        type: "html",
        value:
          `<div class="admin-link-card-placeholder">` +
          `<span class="admin-link-card-placeholder__label">リンクカード（本番で展開されます）</span>` +
          `<a href="${escaped}" target="_blank" rel="noreferrer noopener">${escaped}</a>` +
          `</div>`,
      } as RootContent;
    }
  };
};

/** Points image nodes at object URLs, or marks them as unavailable. */
const rehypeResolveImages: Plugin<[ImageResolver], HastRoot> = (resolve) => {
  return (tree) => {
    visit(tree, "element", (node: Element) => {
      if (node.tagName !== "img" || !node.properties) return;
      const src = node.properties.src;
      if (typeof src !== "string") return;
      if (/^(https?:)?\/\//.test(src) || src.startsWith("data:")) return;

      const resolved = resolve(src);
      if (resolved) {
        node.properties.src = resolved;
        return;
      }
      // Committed images are not served from the admin origin, so show the
      // reference rather than a broken image.
      node.properties.src = "";
      node.properties["data-unresolved"] = src;
      node.properties.alt = node.properties.alt || src;
    });
  };
};

export function createPreviewRenderer(resolve: ImageResolver) {
  return unified()
    .use(remarkParse)
    .use(sharedRemarkPlugins as never)
    .use(remarkLinkCardPlaceholder)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeResolveImages, resolve)
    .use(rehypeStringify, { allowDangerousHtml: true });
}

export async function renderPreview(
  markdown: string,
  resolve: ImageResolver,
): Promise<string> {
  const file = await createPreviewRenderer(resolve).process(markdown);
  return String(file);
}
