import type { Frontmatter, PostLayout } from "../post";

/** How a post stands relative to `main` and its working branch. */
export type BranchState = "main-only" | "branch-ahead" | "draft-only";

export interface PostSummary {
  slug: string;
  layout: PostLayout;
  title: string;
  description?: string;
  pubDate?: string;
  updatedDate?: string;
  tags?: string[];
  branchState: BranchState;
  /** Commits the working branch is ahead of / behind `main`. */
  aheadBy: number;
  behindBy: number;
  /** True when the post exists on `main` (i.e. it is published). */
  onMain: boolean;
  branch?: string;
}

export interface PostImage {
  /** Repository-relative path. */
  path: string;
  /** How the markdown body refers to it. */
  reference: string;
}

export interface PostDetail {
  slug: string;
  layout: PostLayout;
  frontmatter: Frontmatter;
  body: string;
  images: PostImage[];
  /**
   * Opaque, backend-defined version token for the content the edit is based
   * on; echoed back on save for conflict detection. The GitHub backend uses
   * the working branch's tip commit when a branch exists, and the markdown
   * file's blob SHA on `main` otherwise.
   */
  baseSha: string;
  branchState: BranchState;
  aheadBy: number;
  behindBy: number;
  onMain: boolean;
}

export interface NewImage {
  /** File name only; the backend decides the directory. */
  name: string;
  /** base64-encoded contents (no data: prefix). */
  contentBase64: string;
}

export interface SaveInput {
  slug: string;
  layout: PostLayout;
  frontmatter: Frontmatter;
  body: string;
  images: NewImage[];
  /** Repository-relative paths to remove in the same commit. */
  deletions: string[];
  /**
   * The `PostDetail.baseSha` the edit started from, passed back unchanged.
   * Empty for a brand new post; required for an update.
   */
  baseSha: string;
  message?: string;
}

export type SaveResult =
  | { ok: true; commitSha: string; branch: string; images: PostImage[] }
  | { ok: false; reason: "conflict"; remoteSha: string }
  | { ok: false; reason: "exists" };

export interface ListOptions {
  /** Number of entries to skip, after ordering. */
  offset?: number;
  /** Maximum number of entries to return. Omitted means all of them. */
  limit?: number;
}

export interface ContentBackend {
  listPosts(options?: ListOptions): Promise<PostSummary[]>;
  getPost(slug: string): Promise<PostDetail | undefined>;
  savePost(input: SaveInput, isNew: boolean): Promise<SaveResult>;
  /** Discards an unpublished draft. Refuses when the post exists on `main`. */
  discardDraft(slug: string): Promise<{ ok: boolean; reason?: string }>;
}
