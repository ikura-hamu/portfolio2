/**
 * GitHub App authentication.
 *
 * The admin UI authenticates the person with an OAuth App (identity only) and
 * writes with a GitHub App installation token scoped to a single repository.
 * That keeps the write credential narrow and entirely server-side.
 */
import { createSign } from "node:crypto";
import { env } from "../env";

interface CachedToken {
  token: string;
  expiresAt: number;
}

/**
 * The in-flight request is cached rather than the finished token, so parallel
 * API calls mint once instead of once each.
 */
let inflight: Promise<CachedToken> | undefined;

function require_(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
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
  const current = await inflight?.catch(() => undefined);
  if (current && current.expiresAt > Date.now() + 60_000) return current.token;

  const pending = mintInstallationToken();
  inflight = pending;
  // A failed mint must not be cached, or every later call reuses the failure.
  pending.catch(() => {
    if (inflight === pending) inflight = undefined;
  });
  return (await pending).token;
}

async function mintInstallationToken(): Promise<CachedToken> {
  const installationId = require_(
    "GITHUB_APP_INSTALLATION_ID",
    env.GITHUB_APP_INSTALLATION_ID,
  );
  const response = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${createAppJWT()}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
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
