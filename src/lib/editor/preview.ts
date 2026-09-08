import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import remarkToc from "remark-toc";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import { splitDocument } from "./document";
import { tocOptions } from "../markdown-options";

interface HtmlNode {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HtmlNode[];
}

export function imageURL(
  src: string,
  path: string,
  ref: string,
): string | undefined {
  if (/^https:\/\//.test(src)) return src;
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(src) || src.startsWith("//"))
    return undefined;
  const root = "https://repository.invalid/";
  const url = new URL(
    src.startsWith("/") ? `public${src}` : src,
    src.startsWith("/") ? root : `${root}${path}`,
  );
  if (
    url.origin !== new URL(root).origin ||
    !/\.(png|jpe?g|webp|gif|avif|svg)$/i.test(url.pathname)
  )
    return undefined;
  return `https://raw.githubusercontent.com/ikura-hamu/portfolio2/${encodeURIComponent(ref)}${url.pathname}`;
}

export async function preview(
  source: string,
  path: string,
  branch: string,
): Promise<string> {
  const { body } = splitDocument(source);
  const result = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkBreaks)
    .use(remarkToc, tocOptions)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeSanitize)
    .use(() => (tree: HtmlNode) => {
      function visit(node: HtmlNode) {
        if (node.tagName === "img" && node.properties) {
          node.properties.src =
            imageURL(String(node.properties.src ?? ""), path, branch) ?? "";
          node.properties.referrerPolicy = "no-referrer";
          node.properties.loading = "lazy";
        }
        if (node.tagName === "a" && node.properties) {
          const href = String(node.properties.href ?? "");
          if (!href.startsWith("#")) {
            node.properties.target = "_blank";
            node.properties.rel = "noopener noreferrer";
            if (href.startsWith("/"))
              node.properties.href = new URL(
                href,
                "https://ikura-hamu.work",
              ).toString();
          }
        }
        node.children?.forEach(visit);
      }
      visit(tree);
    })
    .use(rehypeStringify)
    .process(body);
  return String(result);
}
