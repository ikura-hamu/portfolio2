/**
 * Environment variable access.
 *
 * On Vercel the variables are set on the running process, so `process.env` is
 * the source of truth. Locally, Astro only exposes `.env` through
 * `import.meta.env` - but referencing that here inlines *every* loaded value,
 * secrets included, into the built server bundle (verified: a build with a
 * `.env` present embedded SESSION_SECRET into the output). So `.env` is read
 * directly instead, and only outside production.
 */
import { readFileSync } from "node:fs";

/** `process` is absent in the browser; these values are server-side only. */
const proc: Record<string, string | undefined> =
  typeof process !== "undefined" && process.env ? process.env : {};

let fileEnv: Record<string, string> | undefined;

/** Minimal `KEY=value` parser - enough for a local development file. */
function parseEnvFile(source: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    }
    if (key !== "") out[key] = value;
  }
  return out;
}

function fromEnvFile(name: string): string | undefined {
  // Deployments never ship a .env; skipping in production also avoids a
  // pointless filesystem read on every cold start.
  if (proc.NODE_ENV === "production") return undefined;
  if (fileEnv === undefined) {
    try {
      fileEnv = parseEnvFile(readFileSync(".env", "utf8"));
    } catch {
      fileEnv = {};
    }
  }
  return fileEnv[name];
}

function read(name: string): string | undefined {
  const runtime = proc[name];
  if (runtime !== undefined && runtime !== "") return runtime;
  const fromFile = fromEnvFile(name);
  return fromFile !== undefined && fromFile !== "" ? fromFile : undefined;
}

export const env = {
  get ADMIN_BACKEND() {
    return read("ADMIN_BACKEND");
  },
  get ADMIN_AUTH() {
    return read("ADMIN_AUTH");
  },
  get SESSION_SECRET() {
    return read("SESSION_SECRET");
  },
  get ALLOWED_GITHUB_USER_ID() {
    return read("ALLOWED_GITHUB_USER_ID");
  },
  get GITHUB_OAUTH_CLIENT_ID() {
    return read("GITHUB_OAUTH_CLIENT_ID");
  },
  get GITHUB_OAUTH_CLIENT_SECRET() {
    return read("GITHUB_OAUTH_CLIENT_SECRET");
  },
  get GITHUB_APP_ID() {
    return read("GITHUB_APP_ID");
  },
  get GITHUB_APP_PRIVATE_KEY() {
    return read("GITHUB_APP_PRIVATE_KEY");
  },
  get GITHUB_APP_INSTALLATION_ID() {
    return read("GITHUB_APP_INSTALLATION_ID");
  },
  get CONTENT_REPO() {
    return read("CONTENT_REPO");
  },
  get CONTENT_BRANCH() {
    return read("CONTENT_BRANCH");
  },
};
