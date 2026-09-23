import { readCache } from "../src/lib/editor/cache";
import { config } from "../src/lib/editor/security";
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { ArticleRepository } from "../src/lib/editor/github";
import {
  EditorError,
  requireOrigin,
  signSession,
  validSession,
} from "../src/lib/editor/security";
import {
  articlePath,
  newDocument,
  splitDocument,
  updateMetadata,
  validArticlePath,
  validateDocument,
} from "../src/lib/editor/document";
import { preview, imageURL } from "../src/lib/editor/preview";

const sha = "a".repeat(40);
const nextSha = "b".repeat(40);
const branch = "blog/example-012345abcdef";
const path = "src/content/blog/example/index.md";
const source = '---\ntitle: "記事"\npubDate: 2026-09-08\n---\n\n本文\n';

function backend(initial: { source: string; sha: string } | null) {
  let file = initial;
  const writes: { url: string; body: Record<string, unknown> }[] = [];
  const repo = new ArticleRepository(async (url, method = "GET", raw) => {
    if (method === "GET") {
      if (url.includes("/git/ref/heads/main")) return { object: { sha } };
      if (url.includes("/contents/")) {
        if (!file || !url.includes("/example/index.md"))
          throw new EditorError(404, "missing");
        return {
          type: "file",
          encoding: "base64",
          sha: file.sha,
          content: Buffer.from(file.source).toString("base64"),
        };
      }
    }
    const body = raw as Record<string, unknown>;
    writes.push({ url, body });
    if (method === "PUT") {
      file = {
        source: Buffer.from(body.content as string, "base64").toString(),
        sha: nextSha,
      };
      return { content: { sha: nextSha } };
    }
    return {};
  });
  return { repo, writes };
}

test("new articles use slug/index.md; legacy paths remain editable", () => {
  assert.equal(
    articlePath("260908-example"),
    "src/content/blog/260908-example/index.md",
  );
  assert.ok(validArticlePath("src/content/blog/240302_traP-blog.md"));
  for (const value of [
    "src/content/blog/_template.md",
    "src/content/blog/../index.md",
    ".github/workflows/ci.yaml",
    "src/content/blog/a/b.md",
    "src/content/blog/a%2Fb/index.md",
  ])
    assert.equal(validArticlePath(value), false);
});

test("existing Markdown remains byte-identical when metadata is unchanged", () => {
  const paths = execFileSync("git", ["ls-files", "-z", "src/content/blog"], {
    encoding: "utf8",
  })
    .split("\0")
    .filter((path) => path.endsWith(".md") && !path.includes("/_"));
  for (const path of paths) {
    const original = readFileSync(path, "utf8");
    assert.equal(updateMetadata(original, {}), original);
    validateDocument(original);
  }
});

test("metadata edits keep unknown fields, comments and the exact body", () => {
  const raw =
    "---\r\ntitle: old # keep\r\ncustom: yes\r\n---\r\n\r\n本文  \r\n";
  const updated = updateMetadata(raw, { title: '新しい "題名"' });
  assert.equal(splitDocument(updated).data.title, '新しい "題名"');
  assert.equal(splitDocument(updated).data.custom, "yes");
  assert.equal(splitDocument(updated).body, splitDocument(raw).body);
  assert.match(updated, /# keep/);
  assert.doesNotThrow(() => validateDocument(newDocument("日本語の記事")));
  assert.throws(() => validateDocument("---\ntitle: a\ntitle: b\n---\n"));
});

test("saving rejects main, other branches and non-article paths before writing", async () => {
  const { repo, writes } = backend(null);
  for (const target of ["main", "develop", "refs/heads/main", "blog/../main"])
    await assert.rejects(
      repo.save({ path, branch: target, source, sha: null }),
    );
  await assert.rejects(
    repo.save({ path: ".github/workflows/ci.yaml", branch, source, sha: null }),
  );
  assert.equal(writes.length, 0);
});

test("new branch starts at main and saving writes only the explicit branch", async () => {
  const { repo, writes } = backend(null);
  const draft = await repo.start({ slug: "example" });
  assert.equal(draft.path, path);
  assert.equal(writes[0].body.sha, sha);
  assert.match(
    writes[0].body.ref as string,
    /^refs\/heads\/blog\/example-[a-f0-9]{12}$/,
  );
  await repo.save({ path, branch: draft.branch, source, sha: null });
  assert.equal(writes[1].body.branch, draft.branch);
  assert.equal(
    Buffer.from(writes[1].body.content as string, "base64").toString(),
    source,
  );
});

test("a stale SHA never overwrites remote text; lost-response retries add no commit", async () => {
  const { repo, writes } = backend({ sha: nextSha, source });
  await assert.rejects(
    repo.save({ path, branch, source: source + "変更", sha }),
    (error) => error instanceof EditorError && error.status === 409,
  );
  assert.deepEqual(await repo.save({ path, branch, source, sha }), {
    sha: nextSha,
  });
  assert.equal(writes.length, 0);
});

test("updates send the read SHA and retain the path", async () => {
  const { repo, writes } = backend({ sha, source });
  await repo.save({ path, branch, source: source + "追記", sha });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].body.sha, sha);
  assert.equal(writes[0].body.branch, branch);
  assert.ok(writes[0].url.endsWith(path));
});

test("signed sessions reject tampering, expiry and another user; CSRF is rejected", () => {
  const secret = "s".repeat(32);
  const cookie = signSession("104292023", secret, 1000);
  assert.ok(validSession(cookie, "104292023", secret, 1001));
  assert.equal(validSession(cookie + "x", "104292023", secret, 1001), false);
  assert.equal(validSession(cookie, "other", secret, 1001), false);
  assert.equal(
    validSession(cookie, "104292023", secret, 1000 + 8 * 60 * 60 * 1000),
    false,
  );
  assert.throws(() =>
    requireOrigin(
      new Request("https://example.com", {
        headers: { Origin: "https://evil.example" },
      }),
      "https://example.com",
    ),
  );
});

test("preview sanitizes executable HTML and resolves both image layouts", async () => {
  const html = await preview(
    source +
      '\n<script>alert(1)</script><img src="./photo.webp" onerror="alert(1)"><a href="javascript:alert(1)">x</a>',
    path,
    branch,
  );
  assert.doesNotMatch(html, /<script|onerror|javascript:/);
  assert.match(html, /raw\.githubusercontent\.com/);
  assert.equal(
    imageURL("../../images/a.jpg", "src/content/blog/legacy.md", branch),
    `https://raw.githubusercontent.com/ikura-hamu/portfolio2/${encodeURIComponent(branch)}/src/images/a.jpg`,
  );
  assert.equal(
    imageURL("./a.jpg", path, branch),
    `https://raw.githubusercontent.com/ikura-hamu/portfolio2/${encodeURIComponent(branch)}/src/content/blog/example/a.jpg`,
  );
  assert.equal(
    imageURL("/a.jpg", path, branch),
    `https://raw.githubusercontent.com/ikura-hamu/portfolio2/${encodeURIComponent(branch)}/public/a.jpg`,
  );
  assert.equal(imageURL("javascript:alert(1)", path, branch), undefined);
});

test("configuration logs missing/invalid names without exposing values", (t) => {
  const fixture = {
    EDITOR_ORIGIN: "https://preview.example.com",
    EDITOR_SESSION_SECRET: "test-session-secret-".repeat(3),
    GITHUB_APP_ID: "test-app-id",
    GITHUB_APP_CLIENT_ID: "test-client-id",
    GITHUB_APP_CLIENT_SECRET: "test-client-secret",
    GITHUB_APP_PRIVATE_KEY: "test-private-key",
    GITHUB_APP_INSTALLATION_ID: "test-installation-id",
    EDITOR_GITHUB_USER_ID: "test-user-id",
  };
  const previous = Object.fromEntries(
    Object.keys(fixture).map((name) => [name, process.env[name]]),
  );
  const log = t.mock.method(console, "error", () => {});
  try {
    Object.assign(process.env, fixture);
    assert.equal(config().EDITOR_ORIGIN, fixture.EDITOR_ORIGIN);
    assert.equal(log.mock.callCount(), 0);

    delete process.env.GITHUB_APP_CLIENT_SECRET;
    process.env.GITHUB_APP_PRIVATE_KEY = "  ";
    process.env.EDITOR_SESSION_SECRET = "short-secret";
    process.env.EDITOR_ORIGIN = "not-a-url-sensitive-marker";
    const genericError = (error: unknown) =>
      error instanceof EditorError &&
      error.status === 503 &&
      error.message === "エディタの認証設定がまだ完了していません。";
    assert.throws(config, genericError);
    const details = log.mock.calls[0].arguments[1] as {
      missing: string[];
      invalid: { name: string; reason: string }[];
    };
    assert.deepEqual(details.missing, [
      "GITHUB_APP_CLIENT_SECRET",
      "GITHUB_APP_PRIVATE_KEY",
    ]);
    assert.deepEqual(
      details.invalid.map((item) => item.name),
      ["EDITOR_SESSION_SECRET", "EDITOR_ORIGIN"],
    );
    const output = JSON.stringify(log.mock.calls[0].arguments);
    for (const value of [
      ...Object.values(fixture),
      "short-secret",
      "not-a-url-sensitive-marker",
    ])
      assert.equal(output.includes(value), false);

    Object.assign(process.env, fixture);
    for (const origin of [
      "https://preview.example.com/path",
      "https://preview.example.com/",
      "http://preview.example.com",
    ]) {
      process.env.EDITOR_ORIGIN = origin;
      assert.throws(config, genericError);
      assert.equal(
        JSON.stringify(log.mock.calls.at(-1)!.arguments).includes(origin),
        false,
      );
    }
    process.env.EDITOR_ORIGIN = "http://localhost:4321";
    assert.equal(config().EDITOR_ORIGIN, "http://localhost:4321");
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("remote status cache expires, can be refreshed and does not hide failures", async () => {
  let now = 0;
  let source = "saved";
  let fail = false;
  let calls = 0;
  const cache = readCache(
    async () => {
      calls++;
      if (fail) throw new Error("offline");
      return source;
    },
    () => now,
  );
  assert.equal(await cache.get("branch"), "saved");
  source = "deleted";
  now = 59_999;
  assert.equal(await cache.get("branch"), "saved");
  assert.equal(calls, 1);
  now = 60_000;
  assert.equal(await cache.get("branch"), "deleted");
  source = "changed";
  cache.clear();
  assert.equal(await cache.get("branch"), "changed");
  cache.clear();
  fail = true;
  await assert.rejects(cache.get("branch"));
  fail = false;
  source = "restored";
  assert.equal(await cache.get("branch"), "restored");
});
