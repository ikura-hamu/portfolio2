/**
 * Authentication: auth mode, allowlist and the stateless session cookie.
 *
 * The session is an encrypted JWT (JWE, via jose) whose key is derived from
 * SESSION_SECRET, and lives in an HttpOnly cookie. Nothing sensitive is ever handed to the
 * browser: the GitHub credentials stay on the server.
 *
 * There is no per-session revocation: rotating SESSION_SECRET invalidates
 * every issued session at once.
 */
import { hkdfSync } from "node:crypto";
import type { APIContext, AstroCookies } from "astro";
import * as env from "astro:env/server";
import { EncryptJWT, jwtDecrypt } from "jose";

export type AuthMode = "oauth" | "bypass";

/**
 * `ADMIN_AUTH=bypass` skips GitHub sign-in for local development. Refused in a
 * production build: a misconfigured deploy must fail loudly rather than
 * quietly skip authentication.
 */
export const AUTH_MODE: AuthMode =
  env.ADMIN_AUTH === "bypass" ? "bypass" : "oauth";

if (import.meta.env.PROD && AUTH_MODE === "bypass") {
  throw new Error(
    "ADMIN_AUTH=bypass is a development-only setting and must not be used in a production build.",
  );
}

export const SESSION_COOKIE = "admin_session";
export const STATE_COOKIE = "admin_oauth_state";

const SESSION_TTL_SECONDS = 24 * 60 * 60;

export interface SessionUser {
  id: number;
  login: string;
  avatarUrl?: string;
}

/** Dummy identity used when ADMIN_AUTH=bypass (localhost development only). */
const DEV_USER: SessionUser = {
  id: 0,
  login: "local-dev",
};

/**
 * The single GitHub account allowed to use the admin UI, as a numeric user id.
 *
 * An id rather than a login name: a login can be changed, and the freed name
 * can then be registered by someone else.
 */
function allowedUserId(): number {
  // The schema in astro.config.mjs only admits a positive integer.
  const id = env.ALLOWED_GITHUB_USER_ID;
  if (id === undefined) {
    // Failing loudly: a missing allowlist is a misconfiguration, and silently
    // denying everyone would look like a redirect loop instead.
    throw new Error(
      "ALLOWED_GITHUB_USER_ID is not set; the admin UI has no allowlist to check against.",
    );
  }
  return id;
}

/** Whether this account may use the admin UI. Compared by numeric id. */
export function isAllowed(user: SessionUser): boolean {
  return user.id === allowedUserId();
}

/**
 * The 256-bit content key, derived from SESSION_SECRET with HKDF so that the
 * secret itself is never used as key material directly.
 */
function key(): Uint8Array {
  const secret = env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET must be set and at least 32 characters long.",
    );
  }
  return new Uint8Array(
    hkdfSync("sha256", secret, "", "portfolio2 admin session", 32),
  );
}

/** Encrypts the session as a compact JWE (direct key, AES-256-GCM). */
export async function seal(user: SessionUser): Promise<string> {
  return new EncryptJWT({ ...user })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .encrypt(key());
}

/**
 * Decrypts and validates the session. A tampered, foreign or expired token
 * all resolve to `undefined`; jose checks the tag and `exp` itself.
 */
export async function unseal(
  value: string | undefined,
): Promise<SessionUser | undefined> {
  if (!value) return undefined;
  try {
    const { payload } = await jwtDecrypt(value, key(), {
      keyManagementAlgorithms: ["dir"],
      contentEncryptionAlgorithms: ["A256GCM"],
      requiredClaims: ["exp"],
    });
    if (typeof payload.id !== "number" || typeof payload.login !== "string") {
      return undefined;
    }
    return {
      id: payload.id,
      login: payload.login,
      avatarUrl:
        typeof payload.avatarUrl === "string" ? payload.avatarUrl : undefined,
    };
  } catch {
    return undefined;
  }
}

export function setSessionCookie(cookies: AstroCookies, value: string): void {
  cookies.set(SESSION_COOKIE, value, {
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearSessionCookie(cookies: AstroCookies): void {
  cookies.delete(SESSION_COOKIE, { path: "/" });
}

/**
 * Whether the connection itself comes from the loopback interface. The Host
 * header is not consulted: it is client-controlled, so with `astro dev --host`
 * anyone on the network could claim to be `localhost`.
 */
function isLoopbackClient(context: Pick<APIContext, "clientAddress">): boolean {
  let address: string;
  try {
    address = context.clientAddress;
  } catch {
    // Some adapters and prerendered contexts cannot tell; treat as remote.
    return false;
  }
  return (
    address === "127.0.0.1" ||
    address === "::1" ||
    address === "::ffff:127.0.0.1"
  );
}

/**
 * Resolves the current user, or `undefined` when the request is not authorized.
 * The auth bypass only ever applies to a dev build reached over loopback.
 */
export async function resolveUser(
  context: Pick<APIContext, "cookies" | "clientAddress">,
): Promise<SessionUser | undefined> {
  if (AUTH_MODE === "bypass") {
    if (import.meta.env.PROD || !isLoopbackClient(context)) return undefined;
    return DEV_USER;
  }
  const user = await unseal(context.cookies.get(SESSION_COOKIE)?.value);
  if (!user || !isAllowed(user)) return undefined;
  return user;
}
