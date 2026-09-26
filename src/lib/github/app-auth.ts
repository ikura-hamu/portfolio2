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

/**
 * A token getter meant to live for a single request: the first call mints an
 * installation token and every later call, including concurrent ones, shares
 * that same promise. Nothing outlives the request, so there is no expiry to
 * track; a token is valid for an hour, far longer than any request.
 */
export function installationTokenForRequest(): () => Promise<string> {
  let token: Promise<string> | undefined;
  return () => (token ??= mintInstallationToken());
}

async function mintInstallationToken(): Promise<string> {
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

  const data = (await response.json()) as { token: string };
  return data.token;
}
