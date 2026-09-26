/**
 * GitHub backend.
 *
 * Saves never touch `main`: each post gets a `post/<slug>` working branch that
 * is created from the tip of `main` on first save and reused afterwards.
 * Merging back is deliberately out of scope for the admin UI.
 */
import {
  assertValidSlug,
  isValidSlug,
  isImagePath,
  assertWritablePath,
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
import type { PostLayout } from "../post";
import * as git from "../github/git";
import type { TreeItem } from "../github/git";
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

function branchFor(slug: string): string {
  return `post/${assertValidSlug(slug)}`;
}

function headRef(branch: string): string {
  return `heads/${branch}`;
}

/** Markdown blobs of the blog collection, keyed by slug. */
function collectPosts(
  tree: TreeItem[],
): Map<string, { path: string; sha: string }> {
  const out = new Map<string, { path: string; sha: string }>();
  for (const item of tree) {
    if (item.type !== "blob") continue;
    const slug = slugFromMarkdownPath(item.path);
    if (!slug) continue;
    out.set(slug, { path: item.path, sha: item.sha });
  }
  return out;
}

function collectImages(
  tree: TreeItem[],
  slug: string,
  layout: PostLayout,
): PostImage[] {
  const dir = `${imageDir(slug, layout)}/`;
  return tree
    .filter(
      (item) =>
        item.type === "blob" &&
        item.path.startsWith(dir) &&
        !item.path.slice(dir.length).includes("/") &&
        isImagePath(item.path),
    )
    .map((item) => ({
      path: item.path,
      reference: imageTarget(slug, layout, item.path.slice(dir.length))
        .reference,
    }));
}

export class GitHubBackend implements ContentBackend {
  private repo = git.repoFromEnv();
  private main = git.mainBranch();

  private async treeOf(commitSha: string): Promise<TreeItem[]> {
    const { treeSha } = await git.getCommit(this.repo, commitSha);
    const { tree } = await git.getTree(this.repo, treeSha);
    return tree;
  }

  /**
   * Posts with a working branch first, then the ones that only exist on
   * `main`; each group newest first by the `YYMMDD_` prefix of the file name.
   *
   * The order comes from the file listing alone, so the requested page is
   * selected before anything is read. Only the posts on that page cost a blob
   * fetch, which is what makes `offset`/`limit` bound the GitHub traffic.
   */
  async listPosts(options?: ListOptions): Promise<PostSummary[]> {
    const mainSha = await git.getRefSha(this.repo, headRef(this.main));
    if (!mainSha) throw new Error(`Branch not found: ${this.main}`);

    const mainTree = await this.treeOf(mainSha);
    const mainPosts = collectPosts(mainTree);

    const branchBySlug = new Map<string, { name: string; sha: string }>();
    for (const branch of await git.listBranches(this.repo, "post/")) {
      const slug = branch.name.slice("post/".length);
      // A ref such as `post/a/b` is not a post branch.
      if (isValidSlug(slug)) branchBySlug.set(slug, branch);
    }

    const ordered = [...new Set([...mainPosts.keys(), ...branchBySlug.keys()])]
      .map((slug) => ({ slug, isDraft: branchBySlug.has(slug) }))
      .sort(compareForListing);

    const summaries = await Promise.all(
      paginate(ordered, options).map((entry) =>
        this.summarize(entry.slug, mainPosts, branchBySlug.get(entry.slug)),
      ),
    );
    // A `post/<slug>` branch whose markdown has been removed has nothing to
    // show; it is dropped rather than rendered as an empty row.
    return summaries.filter((summary) => summary !== undefined);
  }

  /**
   * Reads one post for the list. A post with a working branch is read from
   * that branch, so the row shows the title being worked on rather than the
   * one still on `main`.
   */
  private async summarize(
    slug: string,
    mainPosts: Map<string, { path: string; sha: string }>,
    branch: { name: string; sha: string } | undefined,
  ): Promise<PostSummary | undefined> {
    const onMain = mainPosts.has(slug);

    let entry = mainPosts.get(slug);
    let aheadBy = 0;
    let behindBy = 0;

    if (branch) {
      const [comparison, tree] = await Promise.all([
        git
          .compare(this.repo, this.main, branch.name)
          .catch(() => ({ ahead_by: 0, behind_by: 0 })),
        this.treeOf(branch.sha),
      ]);
      aheadBy = comparison.ahead_by;
      behindBy = comparison.behind_by;
      entry = collectPosts(tree).get(slug) ?? entry;
    }

    if (!entry) return undefined;

    const { frontmatter } = parsePost(
      await git.getBlobText(this.repo, entry.sha),
    );
    return {
      slug,
      layout: layoutFromMarkdownPath(entry.path),
      title: frontmatter.title || slug,
      description: frontmatter.description,
      pubDate: frontmatter.pubDate,
      updatedDate: frontmatter.updatedDate,
      tags: frontmatter.tags,
      branchState: !branch
        ? "main-only"
        : onMain
          ? "branch-ahead"
          : "draft-only",
      aheadBy,
      behindBy,
      onMain,
      branch: branch?.name,
    };
  }

  async getPost(slug: string): Promise<PostDetail | undefined> {
    assertValidSlug(slug);
    const branch = branchFor(slug);

    const branchSha = await git.getRefSha(this.repo, headRef(branch));
    const mainSha = await git.getRefSha(this.repo, headRef(this.main));
    if (!mainSha) throw new Error(`Branch not found: ${this.main}`);

    const tree = await this.treeOf(branchSha ?? mainSha);
    const entry = collectPosts(tree).get(slug);
    if (!entry) return undefined;

    const mainTree = branchSha ? await this.treeOf(mainSha) : tree;
    const onMain = collectPosts(mainTree).has(slug);

    const comparison = branchSha
      ? await git
          .compare(this.repo, this.main, branch)
          .catch(() => ({ ahead_by: 0, behind_by: 0 }))
      : { ahead_by: 0, behind_by: 0 };

    const layout = layoutFromMarkdownPath(entry.path);
    const { frontmatter, body } = parsePost(
      await git.getBlobText(this.repo, entry.sha),
    );

    return {
      slug,
      layout,
      frontmatter,
      body,
      images: collectImages(tree, slug, layout),
      // With a working branch, the edit is based on the branch tip commit.
      // Without one it is based on the markdown blob on `main`, so unrelated
      // commits to `main` do not count as a conflict. See `savePost`.
      baseSha: branchSha ?? entry.sha,
      branchState: !branchSha
        ? "main-only"
        : onMain
          ? "branch-ahead"
          : "draft-only",
      aheadBy: comparison.ahead_by,
      behindBy: comparison.behind_by,
      onMain,
    };
  }

  async savePost(input: SaveInput, isNew: boolean): Promise<SaveResult> {
    assertValidSlug(input.slug);
    const branch = branchFor(input.slug);

    const mainSha = await git.getRefSha(this.repo, headRef(this.main));
    if (!mainSha) throw new Error(`Branch not found: ${this.main}`);

    const branchSha = await git.getRefSha(this.repo, headRef(branch));
    const tipSha = branchSha ?? mainSha;

    const tree = await this.treeOf(tipSha);
    const existing = collectPosts(tree).get(input.slug);
    if (isNew && existing) return { ok: false, reason: "exists" };

    // An update must still start from what the edit was loaded from, or a
    // concurrent save from another device would be silently overwritten. With
    // a working branch that is the branch tip commit; without one it is the
    // markdown blob on `main` (see `getPost`), so a merge of some other change
    // into `main` is not a conflict. A branch created elsewhere in between
    // also conflicts, because its commit SHA never equals a blob SHA. A new
    // post has nothing to compare against; the "exists" check covers it.
    if (!isNew) {
      const remoteSha = branchSha ?? existing?.sha ?? "";
      if (input.baseSha === "" || input.baseSha !== remoteSha) {
        return { ok: false, reason: "conflict", remoteSha };
      }
    }

    const layout: PostLayout = existing
      ? layoutFromMarkdownPath(existing.path)
      : input.layout;

    const entries: git.TreeEntry[] = [];
    const written: PostImage[] = [];

    for (const image of input.images) {
      const name = sanitizeImageName(image.name);
      const { path: repoPath, reference } = imageTarget(
        input.slug,
        layout,
        name,
      );
      const safePath = assertWritablePath(repoPath);
      const sha = await git.createBlob(this.repo, image.contentBase64);
      entries.push({ path: safePath, mode: "100644", type: "blob", sha });
      written.push({ path: safePath, reference });
    }

    for (const deletion of input.deletions) {
      entries.push({
        path: assertOwnedByPost(deletion, input.slug, layout),
        mode: "100644",
        type: "blob",
        sha: null,
      });
    }

    const markdown = assertWritablePath(markdownPath(input.slug, layout));
    const markdownSha = await git.createBlob(
      this.repo,
      Buffer.from(
        serializePost(input.frontmatter, input.body),
        "utf8",
      ).toString("base64"),
    );
    entries.push({
      path: markdown,
      mode: "100644",
      type: "blob",
      sha: markdownSha,
    });

    const { treeSha: baseTreeSha } = await git.getCommit(this.repo, tipSha);
    const newTreeSha = await git.createTree(this.repo, baseTreeSha, entries);
    const message =
      input.message ?? `${isNew ? "Add" : "Update"} ${input.slug}`;
    const commitSha = await git.createCommit(this.repo, message, newTreeSha, [
      tipSha,
    ]);

    try {
      if (branchSha) {
        await git.updateRef(this.repo, headRef(branch), commitSha);
      } else {
        await git.createRef(this.repo, headRef(branch), commitSha);
      }
    } catch (error) {
      // The branch moved (update is not a fast-forward) or was created
      // (ref already exists) after it was read above: another save won the
      // race. The commit just made is left unreferenced.
      if (error instanceof git.GitHubApiError && error.status === 422) {
        const remoteSha = await git.getRefSha(this.repo, headRef(branch));
        return { ok: false, reason: "conflict", remoteSha: remoteSha ?? "" };
      }
      throw error;
    }

    return { ok: true, commitSha, branch, images: written };
  }

  async discardDraft(slug: string): Promise<{ ok: boolean; reason?: string }> {
    assertValidSlug(slug);
    const mainSha = await git.getRefSha(this.repo, headRef(this.main));
    if (!mainSha) throw new Error(`Branch not found: ${this.main}`);

    // Published posts must not be removable from here; that goes through a PR.
    const mainTree = await this.treeOf(mainSha);
    if (collectPosts(mainTree).has(slug)) {
      return {
        ok: false,
        reason:
          "この記事は main に公開済みです。公開済み記事の削除は管理画面では行えません。",
      };
    }

    await git.deleteRef(this.repo, headRef(branchFor(slug)));
    return { ok: true };
  }
}
