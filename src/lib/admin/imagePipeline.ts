/**
 * Prepares dropped or pasted images before they are committed.
 *
 * Photos straight from a phone are several megabytes, and the blog displays
 * images at no more than 500px, so they are downscaled and converted to webp
 * to keep the repository small. `imageOrientation: "from-image"` applies the
 * EXIF rotation, which canvas would otherwise ignore.
 */
import { sanitizeImageName } from "../paths";

const MAX_EDGE = 1600;
const WEBP_QUALITY = 0.85;

export interface PreparedImage {
  name: string;
  blob: Blob;
}

/**
 * Names go through the same rules the server applies, so what the markdown
 * refers to is exactly what gets committed.
 */
function toWebpName(name: string): string {
  const base = name.replace(/\.[^.]+$/, "") || "image";
  try {
    return sanitizeImageName(`${base}.webp`);
  } catch {
    return "image.webp";
  }
}

/** SVGs are left alone: rasterizing them would lose what makes them useful. */
function shouldPassThrough(file: Blob): boolean {
  return file.type === "image/svg+xml" || file.type === "image/gif";
}

export async function prepareImage(
  file: File | Blob,
  fallbackName = "image",
): Promise<PreparedImage> {
  const originalName = file instanceof File ? file.name : fallbackName;

  if (shouldPassThrough(file)) {
    return { name: sanitize(originalName), blob: file };
  }

  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    return { name: sanitize(originalName), blob: file };
  }
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", WEBP_QUALITY),
  );
  if (!blob) return { name: sanitize(originalName), blob: file };

  return { name: toWebpName(originalName), blob };
}

function sanitize(name: string): string {
  try {
    return sanitizeImageName(name);
  } catch {
    return "image.webp";
  }
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
