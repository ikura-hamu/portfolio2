/**
 * Write-target validation shared by every backend.
 *
 * The client never chooses a repository and never supplies a free-form path:
 * it supplies a slug, and everything below is derived from it. These helpers
 * are the single place that decides whether a path may be written.
 *
 * This module uses `node:path` and is server-only. What the browser needs
 * (slug and image-name checks) lives in `contentPaths.ts` and is re-exported
 * here so server code has one import site.
 */
import { posix } from "node:path";
import { UnsafePathError } from "./contentPaths";

export {
  BLOG_DIR,
  IMAGES_DIR,
  UnsafePathError,
  assertValidSlug,
  isImagePath,
  isValidSlug,
  sanitizeImageName,
} from "./contentPaths";

/** The only prefixes the admin UI is ever allowed to write to. */
export const WRITABLE_PREFIXES = ["src/content/blog/", "src/images/"] as const;

/**
 * Normalizes a repository-relative path and rejects anything that could escape
 * the writable prefixes. Returns the normalized path.
 */
export function assertWritablePath(path: string): string {
  if (typeof path !== "string" || path.length === 0) {
    throw new UnsafePathError(String(path), "empty path");
  }
  if (posix.isAbsolute(path) || /^[a-zA-Z]:/.test(path)) {
    throw new UnsafePathError(path, "absolute paths are not allowed");
  }
  if (path.includes("\0")) {
    throw new UnsafePathError(path, "contains a null byte");
  }
  if (path.includes("\\")) {
    throw new UnsafePathError(path, "backslashes are not allowed");
  }
  // A path that normalization would change has a `.`, `..` or empty segment.
  // Such a path is refused rather than rewritten, so what is written is always
  // exactly what was asked for. A trailing slash survives normalization, and a
  // leading `..` is rejected by the prefix check below.
  const normalized = posix.normalize(path);
  if (normalized !== path || path.endsWith("/")) {
    throw new UnsafePathError(path, "not a normalized path");
  }

  if (!WRITABLE_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    throw new UnsafePathError(
      path,
      `outside the writable prefixes (${WRITABLE_PREFIXES.join(", ")})`,
    );
  }
  return normalized;
}
