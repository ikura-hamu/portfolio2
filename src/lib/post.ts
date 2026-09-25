/**
 * Frontmatter handling and the two on-disk layouts a post can have.
 *
 * Existing posts are a mix of `<slug>.md` (flat) and `<slug>/index.md`
 * (directory). New posts always use the directory layout; flat posts keep
 * their layout so that editing one never moves files around.
 */
import { parse as parseYAML, stringify as stringifyYAML } from "yaml";
import {
  BLOG_DIR,
  IMAGES_DIR,
  UnsafePathError,
  assertValidSlug,
  assertWritablePath,
} from "./paths";

export type PostLayout = "flat" | "directory";

export interface Frontmatter {
  title: string;
  description?: string;
  pubDate?: string;
  updatedDate?: string;
  heroImage?: string;
  heroImageContent?: string;
  tags?: string[];
  /** Any key outside the collection schema, preserved verbatim. */
  [key: string]: unknown;
}

/** Order used when re-serializing, so diffs stay stable across saves. */
const KEY_ORDER = [
  "title",
  "description",
  "pubDate",
  "updatedDate",
  "heroImage",
  "heroImageContent",
  "tags",
];

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function markdownPath(slug: string, layout: PostLayout): string {
  assertValidSlug(slug);
  return layout === "directory"
    ? `${BLOG_DIR}/${slug}/index.md`
    : `${BLOG_DIR}/${slug}.md`;
}

/**
 * Where a newly added image goes, and how the markdown refers to it.
 * Directory posts keep images next to `index.md`; flat posts follow the
 * existing `src/images/<slug>/` convention so no file has to move.
 */
export function imageTarget(
  slug: string,
  layout: PostLayout,
  fileName: string,
): { path: string; reference: string } {
  assertValidSlug(slug);
  return layout === "directory"
    ? { path: `${BLOG_DIR}/${slug}/${fileName}`, reference: `./${fileName}` }
    : {
        path: `${IMAGES_DIR}/${slug}/${fileName}`,
        reference: `../../images/${slug}/${fileName}`,
      };
}

/** Derives the slug the glob loader would produce for a markdown path. */
export function slugFromMarkdownPath(path: string): string | undefined {
  const rest = path.startsWith(`${BLOG_DIR}/`)
    ? path.slice(BLOG_DIR.length + 1)
    : undefined;
  if (rest === undefined || !rest.endsWith(".md")) return undefined;
  if (rest.split("/").some((segment) => segment.startsWith("_"))) {
    return undefined;
  }
  const withoutExt = rest.slice(0, -3);
  const segments = withoutExt.split("/");
  if (segments.length === 1) return segments[0].toLowerCase();
  if (segments.length === 2 && segments[1] === "index") {
    return segments[0].toLowerCase();
  }
  return undefined;
}

export function layoutFromMarkdownPath(path: string): PostLayout {
  return path.endsWith("/index.md") ? "directory" : "flat";
}

export interface ParsedPost {
  frontmatter: Frontmatter;
  /** The frontmatter block exactly as it appeared, for the raw YAML editor. */
  rawFrontmatter: string;
  body: string;
}

export function parsePost(source: string): ParsedPost {
  const match = FRONTMATTER_RE.exec(source);
  if (!match) {
    return { frontmatter: { title: "" }, rawFrontmatter: "", body: source };
  }
  const rawFrontmatter = match[1];
  let data: unknown;
  try {
    data = parseYAML(rawFrontmatter);
  } catch {
    data = undefined;
  }
  const frontmatter =
    data && typeof data === "object" && !Array.isArray(data)
      ? normalizeDates(data as Record<string, unknown>)
      : { title: "" };
  return {
    frontmatter: frontmatter as Frontmatter,
    rawFrontmatter,
    body: source.slice(match[0].length),
  };
}

/**
 * The YAML parser turns unquoted timestamps into Date objects. The editor
 * works with strings, so dates are converted back to ISO-with-offset form.
 */
function normalizeDates(
  data: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    out[key] = value instanceof Date ? value.toISOString() : value;
  }
  return out;
}

/**
 * Re-serializes frontmatter in a normalized form. Comments in the original
 * block are lost; this is a deliberate trade-off recorded in the plan.
 */
export function serializePost(frontmatter: Frontmatter, body: string): string {
  const ordered: Record<string, unknown> = {};
  for (const key of KEY_ORDER) {
    const value = frontmatter[key];
    if (isEmpty(value)) continue;
    ordered[key] = value;
  }
  for (const [key, value] of Object.entries(frontmatter)) {
    if (KEY_ORDER.includes(key) || isEmpty(value)) continue;
    ordered[key] = value;
  }

  // Dates must stay unquoted: Astro parses frontmatter with js-yaml, where a
  // plain timestamp becomes a Date and a quoted one stays a string, which the
  // collection's `z.date()` would then reject. The default string type quotes
  // only what needs quoting, so timestamps come out plain.
  const yaml = stringifyYAML(ordered, {
    lineWidth: 0,
    defaultKeyType: "PLAIN",
  }).trimEnd();

  const normalizedBody = body.replace(/^\s*\n/, "").trimEnd();
  return `---\n${yaml}\n---\n\n${normalizedBody}\n`;
}

function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null || value === "") return true;
  return Array.isArray(value) && value.length === 0;
}

/**
 * Paths a post owns: its markdown file, and the directory its images live in.
 * `assertWritablePath` only proves a path is inside the content tree, which
 * would let a broken draft delete another post's files.
 */
export function assertOwnedByPost(
  path: string,
  slug: string,
  layout: PostLayout,
): string {
  const normalized = assertWritablePath(path);
  assertValidSlug(slug);

  if (normalized === markdownPath(slug, layout)) return normalized;

  const imageDir =
    layout === "directory" ? `${BLOG_DIR}/${slug}/` : `${IMAGES_DIR}/${slug}/`;
  const rest = normalized.startsWith(imageDir)
    ? normalized.slice(imageDir.length)
    : undefined;
  if (rest === undefined || rest === "" || rest.includes("/")) {
    throw new UnsafePathError(path, `does not belong to the post "${slug}"`);
  }
  return normalized;
}
