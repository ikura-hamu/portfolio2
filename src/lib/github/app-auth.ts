/**
 * GitHub App authentication.
 *
 * The admin UI authenticates the person with an OAuth App (identity only) and
 * writes with a GitHub App installation token scoped to a single repository.
 * That keeps the write credential narrow and entirely server-side.
 */
import { createSign } from "node:crypto";
import * as env from "astro:env/server";
import { repoFromEnv } from "./git";

interface CachedToken {
  token: string;
  expiresAt: number;
}

/** Re-mint this long before expiry so a request never carries a dying token. */
const EXPIRY_MARGIN_MS = 60_000;

/**
 * `cached` is the last minted token; `inflight` is a mint in progress. Both are
 * read and written synchronously in `getInstallationToken`, before its first
 * `await`, so concurrent callers that find no usable token share one mint.
 */
let cached: CachedToken | undefined;
let inflight: Promise<CachedToken> | undefined;

function require_(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

/** Signs the short-lived app JWT used to request an installation token. */
function createAppJWT(): string {
  const appId = require_("GITHUB_APP_ID", env.GITHUB_APP_ID);
  // Private keys pasted into env vars usually have their newlines escaped.
  const privateKey = require_(
    "GITHUB_APP_PRIVATE_KEY",
    env.GITHUB_APP_PRIVATE_KEY,
  ).replace(/\\n/g, "\n");

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId }),
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  const signature = base64url(signer.sign(privateKey));
  return `${header}.${payload}.${signature}`;
}

export async function getInstallationToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + EXPIRY_MARGIN_MS) {
    return cached.token;
  }
  if (!inflight) {
    const pending = mintInstallationToken().then((token) => {
      cached = token;
      return token;
    });
    inflight = pending;
    // Cleared whether the mint succeeds or fails: a failure must not be
    // reused by later calls, and a success lives on in `cached`.
    pending
      .finally(() => {
        if (inflight === pending) inflight = undefined;
      })
      .catch(() => undefined);
  }
  return (await inflight).token;
}

async function mintInstallationToken(): Promise<CachedToken> {
  const installationId = require_(
    "GITHUB_APP_INSTALLATION_ID",
    env.GITHUB_APP_INSTALLATION_ID,
  );
  // The installation may cover more repositories and permissions than the
  // admin UI needs; the token is narrowed to the content repository and to
  // writing its contents.
  const { repo } = repoFromEnv();
  const response = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${createAppJWT()}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        repositories: [repo],
        permissions: { contents: "write" },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Failed to mint installation token: ${response.status} ${await response.text()}`,
    );
  }

  const data = (await response.json()) as { token: string; expires_at: string };
  return { token: data.token, expiresAt: new Date(data.expires_at).getTime() };
}
