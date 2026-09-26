/**
 * Starts the GitHub OAuth flow.
 *
 * These endpoints live outside `/admin/` on purpose: the admin Service Worker
 * is scoped to `/admin/`, so it can never interfere with the auth redirects.
 */
import { randomBytes } from "node:crypto";
import type { APIRoute } from "astro";
import * as env from "astro:env/server";
import { AUTH_MODE, STATE_COOKIE } from "@/lib/session";

export const prerender = false;

export const GET: APIRoute = (context) => {
  // The bypass needs no cookie: resolveUser grants it per loopback request.
  if (AUTH_MODE === "bypass") {
    return context.redirect("/admin/", 302);
  }

  const clientId = env.GITHUB_OAUTH_CLIENT_ID;
  if (!clientId) {
    return new Response("GITHUB_OAUTH_CLIENT_ID is not configured.", {
      status: 500,
    });
  }

  // 256 bits from the CSPRNG; a UUIDv4 carries only 122 random bits.
  const state = randomBytes(32).toString("base64url");
  context.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  const authorize = new URL("https://github.com/login/oauth/authorize");
  authorize.searchParams.set("client_id", clientId);
  authorize.searchParams.set(
    "redirect_uri",
    new URL("/api/auth/github/callback", context.url.origin).toString(),
  );
  // Identity only: writes go through the GitHub App installation token.
  authorize.searchParams.set("scope", "read:user");
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("allow_signup", "false");

  return context.redirect(authorize.toString(), 302);
};
