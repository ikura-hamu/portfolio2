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
  /** Tip commit the edit is based on; echoed back on save for conflict detection. */
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
  /** Tip SHA the edit started from; empty for a brand new post. */
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
  readonly kind: "github" | "local";
  listPosts(options?: ListOptions): Promise<PostSummary[]>;
  getPost(slug: string, ref?: string): Promise<PostDetail | undefined>;
  savePost(input: SaveInput, isNew: boolean): Promise<SaveResult>;
  /** Discards an unpublished draft. Refuses when the post exists on `main`. */
  discardDraft(slug: string): Promise<{ ok: boolean; reason?: string }>;
}
