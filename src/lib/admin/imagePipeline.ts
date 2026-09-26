/**
 * Prepares dropped or pasted images before they are committed.
 *
 * Photos straight from a phone are several megabytes, and the blog displays
 * images at no more than 500px, so they are downscaled and converted to webp
 * to keep the repository small. `imageOrientation: "from-image"` applies the
 * EXIF rotation, which canvas would otherwise ignore.
 */
import { sanitizeImageName } from "../contentPaths";

const MAX_EDGE = 1600;
const WEBP_QUALITY = 0.85;

export interface PreparedImage {
  name: string;
  blob: Blob;
}

/**
 * Names go through the same rules the server applies, so what the markdown
 * refers to is exactly what gets committed. A name the rules reject falls back
 * to `image` with the given extension, so the extension always matches the
 * bytes that are committed.
 */
function sanitize(name: string, extension: string): string {
  try {
    return sanitizeImageName(name);
  } catch {
    return `image${extension}`;
  }
}

/**
 * The extension an unconverted image is committed with, taken from its MIME
 * type so that it describes the bytes rather than whatever the name says.
 */
function extensionFor(file: Blob, name: string): string {
  const subtype = file.type.startsWith("image/")
    ? file.type.slice("image/".length).split("+")[0]
    : "";
  if (subtype !== "") return `.${subtype === "jpeg" ? "jpg" : subtype}`;
  return /\.[^.]+$/.exec(name)?.[0].toLowerCase() ?? ".png";
}

/**
 * SVGs and GIFs are left alone: rasterizing an SVG would lose what makes it
 * useful, and drawing a GIF onto a canvas keeps only its first frame.
 */
function shouldPassThrough(file: Blob): boolean {
  return file.type === "image/svg+xml" || file.type === "image/gif";
}

export async function prepareImage(
  file: File | Blob,
  fallbackName = "image",
): Promise<PreparedImage> {
  const originalName = file instanceof File ? file.name : fallbackName;
  const unchanged = (): PreparedImage => ({
    name: sanitize(originalName, extensionFor(file, originalName)),
    blob: file,
  });

  if (shouldPassThrough(file)) return unchanged();

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
    return unchanged();
  }
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", WEBP_QUALITY),
  );
  if (!blob) return unchanged();

  const stem = originalName.replace(/\.[^.]+$/, "") || "image";
  return { name: sanitize(`${stem}.webp`, ".webp"), blob };
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
