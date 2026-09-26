/**
 * Write-target validation shared by every backend.
 *
 * The client never chooses a repository and never supplies a free-form path:
 * it supplies a slug, and everything below is derived from it. These helpers
 * are the single place that decides whether a path may be written.
 */

/** The only prefixes the admin UI is ever allowed to write to. */
export const WRITABLE_PREFIXES = ["src/content/blog/", "src/images/"] as const;

export const BLOG_DIR = "src/content/blog";
export const IMAGES_DIR = "src/images";

const SLUG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

export class UnsafePathError extends Error {
  constructor(path: string, reason: string) {
    super(`Refusing to write "${path}": ${reason}`);
    this.name = "UnsafePathError";
  }
}

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

/**
 * Normalizes a repository-relative path and rejects anything that could escape
 * the writable prefixes. Returns the normalized path.
 */
export function assertWritablePath(path: string): string {
  if (typeof path !== "string" || path.length === 0) {
    throw new UnsafePathError(String(path), "empty path");
  }
  if (path.startsWith("/") || /^[a-zA-Z]:/.test(path)) {
    throw new UnsafePathError(path, "absolute paths are not allowed");
  }
  if (path.includes("\0")) {
    throw new UnsafePathError(path, "contains a null byte");
  }
  if (path.includes("\\")) {
    throw new UnsafePathError(path, "backslashes are not allowed");
  }

  const segments: string[] = [];
  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") {
      throw new UnsafePathError(path, "contains an empty or '.' segment");
    }
    if (segment === "..") {
      throw new UnsafePathError(path, "contains a '..' segment");
    }
    segments.push(segment);
  }

  const normalized = segments.join("/");
  if (!WRITABLE_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    throw new UnsafePathError(
      path,
      `outside the writable prefixes (${WRITABLE_PREFIXES.join(", ")})`,
    );
  }
  return normalized;
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
