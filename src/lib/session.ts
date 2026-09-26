/**
 * Authentication: auth mode, allowlist and the stateless session cookie.
 *
 * The session is sealed with AES-GCM using a key derived from SESSION_SECRET
 * and lives in an HttpOnly cookie. Nothing sensitive is ever handed to the
 * browser: the GitHub credentials stay on the server.
 *
 * There is no per-session revocation: rotating SESSION_SECRET invalidates
 * every issued session at once.
 */
import type { APIContext, AstroCookies } from "astro";
import * as env from "astro:env/server";

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

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export interface SessionUser {
  id: number;
  login: string;
  avatarUrl?: string;
}

interface SessionPayload extends SessionUser {
  exp: number;
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

async function key(): Promise<CryptoKey> {
  const secret = env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET must be set and at least 32 characters long.",
    );
  }
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(secret),
  );
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

/** Returns a standalone ArrayBuffer so it satisfies the WebCrypto signatures. */
function fromBase64url(value: string): ArrayBuffer {
  const buffer = Buffer.from(value, "base64url");
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}

export async function seal(user: SessionUser): Promise<string> {
  const payload: SessionPayload = { ...user, exp: Date.now() + SESSION_TTL_MS };
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      await key(),
      new TextEncoder().encode(JSON.stringify(payload)),
    ),
  );
  return `${Buffer.from(iv).toString("base64url")}.${Buffer.from(cipher).toString("base64url")}`;
}

export async function unseal(
  value: string | undefined,
): Promise<SessionUser | undefined> {
  if (!value) return undefined;
  const [ivPart, cipherPart] = value.split(".");
  if (!ivPart || !cipherPart) return undefined;
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64url(ivPart) },
      await key(),
      fromBase64url(cipherPart),
    );
    const payload = JSON.parse(
      new TextDecoder().decode(plain),
    ) as SessionPayload;
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) {
      return undefined;
    }
    return {
      id: payload.id,
      login: payload.login,
      avatarUrl: payload.avatarUrl,
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
    maxAge: SESSION_TTL_MS / 1000,
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
