import { createHash } from "node:crypto";

/**
 * The SHA git gives a blob with these contents, so a file can be compared
 * with a tree entry without uploading it first.
 */
export function gitBlobSha(content: Buffer): string {
  return createHash("sha1")
    .update(`blob ${content.length}\0`)
    .update(content)
    .digest("hex");
}

export const BLOB_SHA_PATTERN = /^[0-9a-f]{40}$/;
