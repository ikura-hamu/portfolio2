/**
 * Thin wrapper over the GitHub Git Data API.
 *
 * Every save goes blob -> tree -> commit -> update ref so that the markdown,
 * its images and any deletions land in a single commit.
 */
import * as env from "astro:env/server";
import { getInstallationToken } from "./app-auth";

export interface TreeEntry {
  path: string;
  mode: "100644";
  type: "blob";
  /** `null` removes the path from the tree. */
  sha: string | null;
}

export interface RepoRef {
  owner: string;
  repo: string;
}

export function repoFromEnv(): RepoRef {
  const full = env.CONTENT_REPO;
  if (!full) throw new Error("Missing environment variable: CONTENT_REPO");
  const [owner, repo] = full.split("/");
  if (!owner || !repo) {
    throw new Error(`CONTENT_REPO must be "owner/repo", got "${full}"`);
  }
  return { owner, repo };
}

export function mainBranch(): string {
  return env.CONTENT_BRANCH ?? "main";
}

export class GitHubApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "GitHubApiError";
  }
}

/**
 * Calls the REST API and parses the JSON response. A response without a body
 * (`204 No Content`, e.g. a ref deletion) resolves to `undefined`.
 */
async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getInstallationToken();
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });

  if (!response.ok) {
    throw new GitHubApiError(
      response.status,
      `${init.method ?? "GET"} ${path} -> ${response.status} ${await response.text()}`,
    );
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text === "" ? undefined : JSON.parse(text)) as T;
}

const base = (r: RepoRef) => `/repos/${r.owner}/${r.repo}`;

export async function getRefSha(
  repo: RepoRef,
  ref: string,
): Promise<string | undefined> {
  try {
    const data = await api<{ object: { sha: string } }>(
      `${base(repo)}/git/ref/${encodeURIComponent(ref)}`,
    );
    return data.object.sha;
  } catch (error) {
    if (error instanceof GitHubApiError && error.status === 404)
      return undefined;
    throw error;
  }
}

export async function createRef(
  repo: RepoRef,
  ref: string,
  sha: string,
): Promise<void> {
  await api(`${base(repo)}/git/refs`, {
    method: "POST",
    body: JSON.stringify({ ref: `refs/${ref}`, sha }),
  });
}

/**
 * Never forced: a ref that moved since `sha`'s parent was read is rejected by
 * GitHub (422, not a fast-forward) and surfaces as a `GitHubApiError`.
 */
export async function updateRef(
  repo: RepoRef,
  ref: string,
  sha: string,
): Promise<void> {
  await api(`${base(repo)}/git/refs/${encodeURIComponent(ref)}`, {
    method: "PATCH",
    body: JSON.stringify({ sha, force: false }),
  });
}

/** Deleting a ref that is already gone is not an error. */
export async function deleteRef(repo: RepoRef, ref: string): Promise<void> {
  try {
    await api(`${base(repo)}/git/refs/${encodeURIComponent(ref)}`, {
      method: "DELETE",
    });
  } catch (error) {
    if (error instanceof GitHubApiError && error.status === 404) return;
    throw error;
  }
}

export async function listBranches(
  repo: RepoRef,
  prefix: string,
): Promise<{ name: string; sha: string }[]> {
  const refs = await api<{ ref: string; object: { sha: string } }[]>(
    `${base(repo)}/git/matching-refs/heads/${prefix}`,
  ).catch((error) => {
    if (error instanceof GitHubApiError && error.status === 404) return [];
    throw error;
  });
  return refs.map((r) => ({
    name: r.ref.replace(/^refs\/heads\//, ""),
    sha: r.object.sha,
  }));
}

export async function getCommit(
  repo: RepoRef,
  commitSha: string,
): Promise<{ treeSha: string }> {
  const data = await api<{ tree: { sha: string } }>(
    `${base(repo)}/git/commits/${commitSha}`,
  );
  return { treeSha: data.tree.sha };
}

export interface TreeItem {
  path: string;
  mode: string;
  type: "blob" | "tree" | "commit";
  sha: string;
  size?: number;
}

/**
 * A truncated tree would silently hide posts, so it is an error rather than a
 * flag the caller has to remember to check.
 */
export async function getTree(
  repo: RepoRef,
  treeSha: string,
): Promise<{ tree: TreeItem[] }> {
  const result = await api<{ tree: TreeItem[]; truncated?: boolean }>(
    `${base(repo)}/git/trees/${treeSha}?recursive=1`,
  );
  if (result.truncated) {
    throw new Error(
      `The git tree ${treeSha} came back truncated; the repository has outgrown a single recursive tree request.`,
    );
  }
  return { tree: result.tree };
}

export async function getBlobText(
  repo: RepoRef,
  blobSha: string,
): Promise<string> {
  const data = await api<{ content: string; encoding: string }>(
    `${base(repo)}/git/blobs/${blobSha}`,
  );
  return data.encoding === "base64"
    ? Buffer.from(data.content, "base64").toString("utf8")
    : data.content;
}

export async function createBlob(
  repo: RepoRef,
  contentBase64: string,
): Promise<string> {
  const data = await api<{ sha: string }>(`${base(repo)}/git/blobs`, {
    method: "POST",
    body: JSON.stringify({ content: contentBase64, encoding: "base64" }),
  });
  return data.sha;
}

export async function createTree(
  repo: RepoRef,
  baseTreeSha: string,
  entries: TreeEntry[],
): Promise<string> {
  const data = await api<{ sha: string }>(`${base(repo)}/git/trees`, {
    method: "POST",
    body: JSON.stringify({ base_tree: baseTreeSha, tree: entries }),
  });
  return data.sha;
}

export async function createCommit(
  repo: RepoRef,
  message: string,
  treeSha: string,
  parents: string[],
): Promise<string> {
  const data = await api<{ sha: string }>(`${base(repo)}/git/commits`, {
    method: "POST",
    body: JSON.stringify({ message, tree: treeSha, parents }),
  });
  return data.sha;
}

export async function compare(
  repo: RepoRef,
  base_: string,
  head: string,
): Promise<{ ahead_by: number; behind_by: number }> {
  return api(
    `${base(repo)}/compare/${encodeURIComponent(base_)}...${encodeURIComponent(head)}`,
  );
}
