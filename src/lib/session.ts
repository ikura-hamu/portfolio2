/**
 * Stateless session cookie.
 *
 * The session is sealed with AES-GCM using a key derived from SESSION_SECRET
 * and lives in an HttpOnly cookie. Nothing sensitive is ever handed to the
 * browser: the GitHub credentials stay on the server.
 */
import type { APIContext, AstroCookies } from "astro";
import { AUTH_MODE } from "./backend";
import { env } from "./env";
import { isAllowed } from "./allowlist";

export { isAllowed } from "./allowlist";

export const SESSION_COOKIE = "admin_session";
export const STATE_COOKIE = "admin_oauth_state";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface SessionUser {
  id: number;
  login: string;
  avatarUrl?: string;
}

interface SessionPayload extends SessionUser {
  exp: number;
}

/** Dummy identity used when ADMIN_AUTH=bypass (localhost development only). */
export const DEV_USER: SessionUser = {
  id: 0,
  login: "local-dev",
};

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

function toBase64url(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
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
  return `${toBase64url(iv)}.${toBase64url(cipher)}`;
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

function isLocalhost(context: Pick<APIContext, "url">): boolean {
  const host = context.url.hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

/**
 * Resolves the current user, or `undefined` when the request is not authorized.
 * The auth bypass only ever applies to a dev build served over localhost.
 */
export async function resolveUser(
  context: Pick<APIContext, "cookies" | "url">,
): Promise<SessionUser | undefined> {
  if (AUTH_MODE === "bypass") {
    if (import.meta.env.PROD || !isLocalhost(context)) return undefined;
    return DEV_USER;
  }
  const user = await unseal(context.cookies.get(SESSION_COOKIE)?.value);
  if (!user || !isAllowed(user)) return undefined;
  return user;
}
