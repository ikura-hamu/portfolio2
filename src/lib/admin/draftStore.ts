/**
 * Local drafts in IndexedDB.
 *
 * Everything the editor holds - frontmatter, body, and images that have not
 * been committed yet - is kept here so that closing the browser or going
 * offline never loses work. Pushing to GitHub stays an explicit action.
 */
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Frontmatter, PostLayout } from "../post";
import type { PostImage, PostSummary } from "../backend/types";

export interface PendingImage {
  name: string;
  /** How the body refers to it once saved. */
  reference: string;
  blob: Blob;
}

export interface Draft {
  /**
   * What the draft is stored under: the post's slug, or `NEW_DRAFT_KEY` for a
   * post that has not been created yet.
   */
  key: string;
  /** The post's slug as entered; may be empty or unfinished for a new post. */
  slug: string;
  layout: PostLayout;
  frontmatter: Frontmatter;
  body: string;
  pendingImages: PendingImage[];
  /** Repository-relative paths to delete on the next save. */
  deletions: string[];
  /** Images already committed, kept so the editor can list them offline. */
  committedImages: PostImage[];
  baseSha: string;
  updatedAt: number;
}

interface AdminDB extends DBSchema {
  drafts: { key: string; value: Draft };
  meta: { key: string; value: unknown };
}

/**
 * A post that has not been created yet has no slug to key on, and the slug can
 * still change while it is being written, so it gets one fixed key. Only one
 * new post can be in progress at a time, which matches the UI.
 */
export const NEW_DRAFT_KEY = "__new__";

const DB_NAME = "blog-admin";
const DB_VERSION = 2;
const POST_LIST_KEY = "post-list-cache";

let dbPromise: Promise<IDBPDatabase<AdminDB> | undefined> | undefined;

/** True once a failure has been reported, so the warning is logged only once. */
let unavailable = false;

/**
 * IndexedDB is missing or blocked in private windows and when site data is
 * disabled. Local drafts are a convenience rather than the source of truth,
 * so every accessor degrades to a no-op instead of taking the screen down.
 */
function db(): Promise<IDBPDatabase<AdminDB> | undefined> {
  dbPromise ??= (async () => {
    try {
      if (typeof indexedDB === "undefined")
        throw new Error("IndexedDB is unavailable");
      return await openDB<AdminDB>(DB_NAME, DB_VERSION, {
        upgrade(database, oldVersion) {
          // Version 1 keyed drafts by `slug`, which overwrote a new post's
          // slug with the fixed key. Those drafts are dropped rather than
          // migrated.
          if (oldVersion >= 1) database.deleteObjectStore("drafts");
          database.createObjectStore("drafts", { keyPath: "key" });
          if (oldVersion < 1) database.createObjectStore("meta");
        },
      });
    } catch (error) {
      if (!unavailable) {
        unavailable = true;
        console.warn(
          "ローカル下書きを保存できません（IndexedDB を利用できない環境です）。",
          error,
        );
      }
      return undefined;
    }
  })();
  return dbPromise;
}

/** Whether local drafts are usable; the UI warns when they are not. */
export async function isDraftStorageAvailable(): Promise<boolean> {
  return (await db()) !== undefined;
}

export async function getDraft(key: string): Promise<Draft | undefined> {
  return (await db())?.get("drafts", key);
}

export async function putDraft(draft: Draft): Promise<void> {
  await (await db())?.put("drafts", { ...draft, updatedAt: Date.now() });
}

export async function deleteDraft(key: string): Promise<void> {
  await (await db())?.delete("drafts", key);
}

export async function listDrafts(): Promise<Draft[]> {
  const all = (await (await db())?.getAll("drafts")) ?? [];
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Last list fetched from the server, shown read-only when offline. */
export async function cachePostList(posts: PostSummary[]): Promise<void> {
  await (await db())?.put("meta", posts, POST_LIST_KEY);
}

export async function getCachedPostList(): Promise<PostSummary[]> {
  const cached = await (await db())?.get("meta", POST_LIST_KEY);
  return Array.isArray(cached) ? (cached as PostSummary[]) : [];
}
