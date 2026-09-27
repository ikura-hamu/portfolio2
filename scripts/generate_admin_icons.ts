/**
 * Generates the admin PWA icons from public/editor.png.
 *
 * The source is transparent and drawn in black lines, which would vanish on a
 * dark launcher, so every output is flattened onto white. The drawing is
 * trimmed first because the source has uneven margins and is not square.
 *
 * Run with `pnpm icons:admin` after replacing the source image.
 */
import { mkdirSync } from "fs";
import sharp from "sharp";

const SOURCE = "public/editor.png";
const OUT_DIR = "public/admin-icons";
const BACKGROUND = { r: 255, g: 255, b: 255, alpha: 1 };

/**
 * Places the trimmed drawing on a white square.
 *
 * @param size    Edge length of the output in pixels.
 * @param fitBox  Returns the largest width/height the drawing may occupy.
 */
async function render(
  path: string,
  size: number,
  fitBox: (width: number, height: number) => number,
) {
  const trimmed = await sharp(SOURCE).trim().toBuffer();
  const { width, height } = await sharp(trimmed).metadata();
  const scale = fitBox(width, height) / Math.max(width, height);
  const drawing = await sharp(trimmed)
    .resize(Math.round(width * scale), Math.round(height * scale))
    .toBuffer();

  const composed = await sharp({
    create: { width: size, height: size, channels: 4, background: BACKGROUND },
  })
    .composite([{ input: drawing, gravity: "centre" }])
    .png()
    .toBuffer();

  // A separate pass: sharp applies flatten before composite within a single
  // pipeline, which would leave the alpha channel in place.
  await sharp(composed)
    .flatten({ background: BACKGROUND })
    .png({ compressionLevel: 9 })
    .toFile(path);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  // "any": the longer side takes 84% of the square.
  const anyFit = (size: number) => () => size * 0.84;
  // "maskable": the whole drawing must fit inside the safe zone, a circle of
  // 80% diameter, so its diagonal (not its longer side) is the constraint.
  const maskableFit = (size: number) => (w: number, h: number) =>
    (size * 0.8 * Math.max(w, h)) / Math.hypot(w, h);

  await render(`${OUT_DIR}/icon-192.png`, 192, anyFit(192));
  await render(`${OUT_DIR}/icon-512.png`, 512, anyFit(512));
  await render(`${OUT_DIR}/maskable-192.png`, 192, maskableFit(192));
  await render(`${OUT_DIR}/maskable-512.png`, 512, maskableFit(512));
  // iOS ignores the manifest icons and rounds the corners itself.
  await render(`${OUT_DIR}/apple-touch-icon.png`, 180, anyFit(180));
  await render(`${OUT_DIR}/favicon-32.png`, 32, anyFit(32));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
