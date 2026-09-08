import { createSign, randomBytes } from "node:crypto";
import {
  articlePath,
  BLOG_ROOT,
  validArticlePath,
  validateDocument,
} from "./document";
import { config, EditorError, validBranch } from "./security";

const REPO = "ikura-hamu/portfolio2";
const encodePath = (path: string) =>
  path.split("/").map(encodeURIComponent).join("/");
type FileContent = {
  type: string;
  sha: string;
  content: string;
  encoding: string;
};
type Requester = (
  path: string,
  method?: string,
  body?: unknown,
) => Promise<unknown>;

export async function installationToken(): Promise<string> {
  const env = config();
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: "RS256", typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ iat: now - 60, exp: now + 540, iss: env.GITHUB_APP_ID }),
  ).toString("base64url");
  const signing = `${header}.${payload}`;
  const signature = createSign("RSA-SHA256")
    .update(signing)
    .sign(env.GITHUB_APP_PRIVATE_KEY.replaceAll("\\n", "\n"), "base64url");
  const result = (await githubRequest(
    `${signing}.${signature}`,
    `/app/installations/${encodeURIComponent(env.GITHUB_APP_INSTALLATION_ID)}/access_tokens`,
    "POST",
    { repositories: ["portfolio2"], permissions: { contents: "write" } },
  )) as { token: string };
  if (!result.token) throw new EditorError(502, "GitHubの認証に失敗しました。");
  return result.token;
}

export async function githubRequest(
  token: string,
  path: string,
  method = "GET",
  body?: unknown,
): Promise<unknown> {
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    redirect: "error",
    signal: AbortSignal.timeout(15000),
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    if (response.status === 404)
      throw new EditorError(404, "記事またはブランチが見つかりません。");
    if ([409, 422].includes(response.status))
      throw new EditorError(
        409,
        "GitHub側が更新されています。差分を確認してください。",
      );
    throw new EditorError(
      502,
      `GitHubへの接続に失敗しました (${response.status})。原稿は端末に保持されています。`,
    );
  }
  return response.json();
}

export class ArticleRepository {
  constructor(private request: Requester) {}
  private call(path: string, method?: string, body?: unknown) {
    return this.request(`/repos/${REPO}${path}`, method, body);
  }

  async read(
    path: string,
    ref: string,
  ): Promise<{ source: string; sha: string } | null> {
    if (!validArticlePath(path))
      throw new EditorError(400, "記事のパスが不正です。");
    if (ref !== "main" && !validBranch(ref) && !/^[a-f0-9]{40}$/.test(ref))
      throw new EditorError(400, "ブランチが不正です。");
    try {
      const file = (await this.call(
        `/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`,
      )) as FileContent;
      if (file.type !== "file" || file.encoding !== "base64")
        throw new EditorError(400, "このファイルは編集できません。");
      return {
        source: Buffer.from(file.content, "base64").toString("utf8"),
        sha: file.sha,
      };
    } catch (error) {
      if (error instanceof EditorError && error.status === 404) return null;
      throw error;
    }
  }

  async list(ref: string) {
    if (ref !== "main" && !validBranch(ref))
      throw new EditorError(400, "ブランチが不正です。");
    const result = (await this.call(
      `/git/trees/${encodeURIComponent(ref)}?recursive=1`,
    )) as { truncated: boolean; tree: { path: string; type: string }[] };
    if (result.truncated)
      throw new EditorError(
        502,
        "記事一覧が大きすぎるため取得できませんでした。",
      );
    return result.tree
      .filter((file) => file.type === "blob" && validArticlePath(file.path))
      .map((file) => file.path);
  }

  async branches() {
    const refs = (await this.call("/git/matching-refs/heads/blog/")) as {
      ref: string;
    }[];
    return refs
      .map((item) => item.ref.replace(/^refs\/heads\//, ""))
      .filter(validBranch);
  }

  async start(input: { path?: string; slug?: string }) {
    const path = input.path ?? articlePath(input.slug ?? "");
    if (!validArticlePath(path))
      throw new EditorError(400, "記事のパスが不正です。");
    const main = (await this.call("/git/ref/heads/main")) as {
      object: { sha: string };
    };
    const existing = await this.read(path, main.object.sha);
    if (input.path && !existing)
      throw new EditorError(404, "記事が見つかりません。");
    if (
      !input.path &&
      (existing ||
        (await this.read(`${BLOG_ROOT}${input.slug}.md`, main.object.sha)))
    )
      throw new EditorError(409, "同じslugの記事がすでに存在します。");
    const slug = path
      .slice(BLOG_ROOT.length)
      .replace(/\/index\.md$|\.md$/g, "")
      .toLowerCase();
    const branch = `blog/${slug}-${randomBytes(6).toString("hex")}`;
    await this.call("/git/refs", "POST", {
      ref: `refs/heads/${branch}`,
      sha: main.object.sha,
    });
    return {
      path,
      branch,
      sha: existing?.sha ?? null,
      source: existing?.source ?? null,
    };
  }

  async save(input: {
    path: string;
    branch: string;
    sha: string | null;
    source: string;
  }) {
    if (!validBranch(input.branch) || !validArticlePath(input.path))
      throw new EditorError(400, "保存先が不正です。mainには保存できません。");
    validateDocument(input.source);
    const current = await this.read(input.path, input.branch);
    // A retry after a lost response is successful only if the remote bytes agree.
    if (current?.source === input.source) return { sha: current.sha };
    if ((current?.sha ?? null) !== input.sha)
      throw new EditorError(
        409,
        "別の端末などで記事が更新されています。差分を確認してください。",
      );
    if (!current && !input.path.endsWith("/index.md"))
      throw new EditorError(400, "新規記事はslug/index.mdに保存してください。");
    if (!current) {
      const legacy = input.path.replace(/\/index\.md$/, ".md");
      if (await this.read(legacy, input.branch))
        throw new EditorError(409, "同じslugの記事がすでに存在します。");
    }
    const result = (await this.call(
      `/contents/${encodePath(input.path)}`,
      "PUT",
      {
        message: `${current ? "Update" : "Create"} blog: ${input.path.slice(BLOG_ROOT.length)}`,
        content: Buffer.from(input.source, "utf8").toString("base64"),
        branch: input.branch,
        ...(current ? { sha: current.sha } : {}),
      },
    )) as { content: { sha: string } };
    return { sha: result.content.sha };
  }
}

export async function repository() {
  const token = await installationToken();
  return new ArticleRepository((path, method, body) =>
    githubRequest(token, path, method, body),
  );
}
