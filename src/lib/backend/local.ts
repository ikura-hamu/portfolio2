/**
 * Local filesystem backend used for development without GitHub.
 *
 * It writes straight into the working tree, so saving a post shows up in the
 * dev server through HMR and can be checked against the real markdown
 * pipeline. Nothing here touches git: branch-related values are dummies.
 */
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  BLOG_DIR,
  assertValidSlug,
  assertWritablePath,
  isImagePath,
  sanitizeImageName,
} from "../paths";
import {
  assertOwnedByPost,
  imageDir,
  imageTarget,
  layoutFromMarkdownPath,
  markdownPath,
  parsePost,
  serializePost,
  slugFromMarkdownPath,
} from "../post";
import { BLOB_SHA_PATTERN, gitBlobSha } from "./blob";
import { compareForListing, paginate } from "./ordering";
import type {
  ContentBackend,
  ListOptions,
  PostDetail,
  PostImage,
  PostSummary,
  SaveInput,
  SaveResult,
} from "./types";

const root = process.cwd();

/**
 * Uploaded images wait here, named by their SHA, until a save copies them
 * into the working tree. Outside the project so the dev server ignores them.
 */
const uploadDir = path.join(os.tmpdir(), "portfolio2-admin-uploads");

function uploadPath(sha: string): string {
  if (!BLOB_SHA_PATTERN.test(sha)) throw new Error(`Not a blob SHA: ${sha}`);
  return path.join(uploadDir, sha);
}

async function readIfExists(file: string): Promise<Buffer | undefined> {
  try {
    return await fs.readFile(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function absolute(repoPath: string): string {
  return path.join(root, repoPath);
}

async function exists(repoPath: string): Promise<boolean> {
  try {
    await fs.access(absolute(repoPath));
    return true;
  } catch {
    return false;
  }
}

/** Walks the blog directory and returns every markdown path a post can live at. */
async function listMarkdownPaths(): Promise<string[]> {
  const out: string[] = [];
  const entries = await fs.readdir(absolute(BLOG_DIR), { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith("_")) continue;
    if (entry.isFile() && entry.name.endsWith(".md")) {
      out.push(`${BLOG_DIR}/${entry.name}`);
    } else if (entry.isDirectory()) {
      const indexPath = `${BLOG_DIR}/${entry.name}/index.md`;
      if (await exists(indexPath)) out.push(indexPath);
    }
  }
  return out;
}

async function findMarkdownPath(slug: string): Promise<string | undefined> {
  for (const candidate of [
    `${BLOG_DIR}/${slug}/index.md`,
    `${BLOG_DIR}/${slug}.md`,
  ]) {
    if (await exists(candidate)) return candidate;
  }
  return undefined;
}

async function listImages(
  slug: string,
  layout: "flat" | "directory",
): Promise<PostImage[]> {
  const dir = imageDir(slug, layout);
  let entries: string[];
  try {
    entries = await fs.readdir(absolute(dir));
  } catch {
    return [];
  }
  return entries
    .filter(isImagePath)
    .sort()
    .map((name) => ({
      path: `${dir}/${name}`,
      reference: imageTarget(slug, layout, name).reference,
    }));
}

export class LocalBackend implements ContentBackend {
  /**
   * Ordered like the GitHub backend, minus the draft group: there are no
   * working branches locally, so every post counts as published. Only the
   * posts on the requested page are read.
   */
  async listPosts(options?: ListOptions): Promise<PostSummary[]> {
    const ordered = (await listMarkdownPaths())
      .map((markdown) => ({ markdown, slug: slugFromMarkdownPath(markdown) }))
      .filter(
        (entry): entry is { markdown: string; slug: string } =>
          entry.slug !== undefined,
      )
      .map((entry) => ({ ...entry, isDraft: false }))
      .sort(compareForListing);

    const summaries: PostSummary[] = [];
    for (const { markdown, slug } of paginate(ordered, options)) {
      const source = await fs.readFile(absolute(markdown), "utf8");
      const { frontmatter } = parsePost(source);
      summaries.push({
        slug,
        layout: layoutFromMarkdownPath(markdown),
        title: frontmatter.title || slug,
        description: frontmatter.description,
        pubDate: frontmatter.pubDate,
        updatedDate: frontmatter.updatedDate,
        tags: frontmatter.tags,
        branchState: "main-only",
        aheadBy: 0,
        behindBy: 0,
        onMain: true,
      });
    }
    return summaries;
  }

  async getPost(slug: string): Promise<PostDetail | undefined> {
    assertValidSlug(slug);
    const markdown = await findMarkdownPath(slug);
    if (!markdown) return undefined;
    const layout = layoutFromMarkdownPath(markdown);
    const source = await fs.readFile(absolute(markdown), "utf8");
    const { frontmatter, body } = parsePost(source);
    return {
      slug,
      layout,
      frontmatter,
      body,
      images: await listImages(slug, layout),
      baseSha: "local",
      branchState: "main-only",
      aheadBy: 0,
      behindBy: 0,
      onMain: true,
    };
  }

  async savePost(input: SaveInput, isNew: boolean): Promise<SaveResult> {
    assertValidSlug(input.slug);
    const existing = await findMarkdownPath(input.slug);
    if (isNew && existing) return { ok: false, reason: "exists" };

    const layout = existing ? layoutFromMarkdownPath(existing) : input.layout;
    const target = assertWritablePath(markdownPath(input.slug, layout));

    // Everything is read before anything is written, so a missing upload
    // leaves the working tree as it was.
    const uploads: { safePath: string; content: Buffer }[] = [];
    const written: PostImage[] = [];
    for (const image of input.images) {
      const name = sanitizeImageName(image.name);
      const { path: repoPath, reference } = imageTarget(
        input.slug,
        layout,
        name,
      );
      const safePath = assertWritablePath(repoPath);
      const content = await readIfExists(uploadPath(image.sha));
      if (!content) return { ok: false, reason: "missing-image" };
      uploads.push({ safePath, content });
      written.push({ path: safePath, reference });
    }

    let changed = false;
    for (const { safePath, content } of uploads) {
      const before = await readIfExists(absolute(safePath));
      if (before?.equals(content)) continue;
      await fs.mkdir(path.dirname(absolute(safePath)), { recursive: true });
      await fs.writeFile(absolute(safePath), content);
      changed = true;
    }

    for (const deletion of input.deletions) {
      const safePath = assertOwnedByPost(deletion, input.slug, layout);
      if (!(await exists(safePath))) continue;
      await fs.rm(absolute(safePath), { force: true });
      changed = true;
    }

    const markdown = Buffer.from(
      serializePost(input.frontmatter, input.body),
      "utf8",
    );
    const before = await readIfExists(absolute(target));
    if (!before?.equals(markdown)) {
      await fs.mkdir(path.dirname(absolute(target)), { recursive: true });
      await fs.writeFile(absolute(target), markdown);
      changed = true;
    }

    return {
      ok: true,
      changed,
      baseSha: "local",
      branch: "local",
      images: written,
    };
  }

  async uploadImage(contentBase64: string): Promise<string> {
    const content = Buffer.from(contentBase64, "base64");
    const sha = gitBlobSha(content);
    await fs.mkdir(uploadDir, { recursive: true });
    await fs.writeFile(uploadPath(sha), content);
    return sha;
  }

  async discardDraft(): Promise<{ ok: boolean; reason?: string }> {
    // There is no working branch locally, so there is nothing to discard.
    return { ok: true };
  }
}
