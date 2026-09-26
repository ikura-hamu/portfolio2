/**
 * Paths and names derived from a slug, shared with the browser.
 *
 * The admin UI checks slugs and image names and builds image references on
 * the client, so this module must not import Node built-ins; a `node:path`
 * import here would be externalized by Vite and break the admin page.
 * Server-only checks on arbitrary paths live in `paths.ts`.
 */

export const BLOG_DIR = "src/content/blog";
export const IMAGES_DIR = "src/images";

export class UnsafePathError extends Error {
  constructor(path: string, reason: string) {
    super(`Refusing to write "${path}": ${reason}`);
    this.name = "UnsafePathError";
  }
}

const SLUG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/**
 * Slugs map straight onto file names and keep their case, so an existing file
 * such as `240302_traP-blog.md` is written back to the same path.
 */
export function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug) && slug.length <= 100;
}

export function assertValidSlug(slug: string): string {
  if (!isValidSlug(slug)) {
    throw new UnsafePathError(slug, "not a valid slug ([A-Za-z0-9_-])");
  }
  return slug;
}

export type PostLayout = "flat" | "directory";

export function markdownPath(slug: string, layout: PostLayout): string {
  assertValidSlug(slug);
  return layout === "directory"
    ? `${BLOG_DIR}/${slug}/index.md`
    : `${BLOG_DIR}/${slug}.md`;
}

/**
 * The directory a post's images live in, without a trailing slash.
 * Directory posts keep images next to `index.md`; flat posts follow the
 * existing `src/images/<slug>/` convention so no file has to move.
 */
export function imageDir(slug: string, layout: PostLayout): string {
  assertValidSlug(slug);
  return layout === "directory"
    ? `${BLOG_DIR}/${slug}`
    : `${IMAGES_DIR}/${slug}`;
}

/** Where a newly added image goes, and how the markdown refers to it. */
export function imageTarget(
  slug: string,
  layout: PostLayout,
  fileName: string,
): { path: string; reference: string } {
  return {
    path: `${imageDir(slug, layout)}/${fileName}`,
    reference:
      layout === "directory"
        ? `./${fileName}`
        : `../../images/${slug}/${fileName}`,
  };
}

/** Extensions an image file may have. Uploads are images, nothing else. */
const IMAGE_EXTENSIONS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".avif",
  ".svg",
];

/** Whether a file name or path has one of the image extensions. */
export function isImagePath(path: string): boolean {
  const lower = path.toLowerCase();
  return IMAGE_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

/**
 * Characters removed from an asset name: path separators, characters that are
 * invalid in file names, and the ones that would terminate or confuse the
 * `![alt](path)` markdown form. Non-ASCII names are left alone - existing
 * posts reference images such as `./五稜郭.webp` and they render fine.
 */
const UNSAFE_NAME_CHARS = /[\\/:*?"'<>|()[\]{}#\u0000-\u001f\u007f]/g;

/**
 * Normalizes a user-supplied image file name. Directory components are
 * dropped, whitespace is collapsed into hyphens so the markdown link does not
 * break, and the extension is checked so an upload cannot drop a script into
 * the content directory.
 */
export function sanitizeImageName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  const cleaned = base
    .normalize("NFC")
    .replace(UNSAFE_NAME_CHARS, "")
    .replace(/\s+/g, "-")
    .replace(/^[.\-]+/, "")
    .replace(/-+/g, "-")
    .trim();
  if (cleaned === "" || cleaned === "." || cleaned === "..") {
    throw new UnsafePathError(name, "image name reduces to nothing usable");
  }
  if (!isImagePath(cleaned)) {
    throw new UnsafePathError(
      name,
      `not an image file name (allowed: ${IMAGE_EXTENSIONS.join(", ")})`,
    );
  }
  return cleaned;
}
