/**
 * Backend selection.
 *
 * `ADMIN_BACKEND=local` swaps GitHub for direct filesystem access so the admin
 * UI can be developed without any GitHub credentials. Both modes are refused
 * in a production build: a misconfigured deploy must fail loudly rather than
 * quietly write to the local disk or skip authentication.
 */
import { env } from "../env";
import type { ContentBackend } from "./types";

export type BackendKind = "github" | "local";
export type AuthMode = "oauth" | "bypass";

export const BACKEND_KIND: BackendKind =
  env.ADMIN_BACKEND === "local" ? "local" : "github";

export const AUTH_MODE: AuthMode =
  env.ADMIN_AUTH === "bypass" ? "bypass" : "oauth";

if (import.meta.env.PROD && BACKEND_KIND === "local") {
  throw new Error(
    "ADMIN_BACKEND=local is a development-only setting and must not be used in a production build.",
  );
}

if (import.meta.env.PROD && AUTH_MODE === "bypass") {
  throw new Error(
    "ADMIN_AUTH=bypass is a development-only setting and must not be used in a production build.",
  );
}

let instance: ContentBackend | undefined;

export async function getBackend(): Promise<ContentBackend> {
  if (instance) return instance;
  if (BACKEND_KIND === "local") {
    const { LocalBackend } = await import("./local");
    instance = new LocalBackend();
  } else {
    const { GitHubBackend } = await import("./github");
    instance = new GitHubBackend();
  }
  return instance;
}

export const IS_LOCAL_BACKEND = BACKEND_KIND === "local";
