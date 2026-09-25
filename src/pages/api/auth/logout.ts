import type { APIRoute } from "astro";
import { clearSessionCookie } from "@/lib/session";

export const prerender = false;

/**
 * POST only: a GET endpoint could be triggered from anywhere with an
 * `<img src="/api/auth/logout">`, logging the owner out on someone else's cue.
 */
export const POST: APIRoute = (context) => {
  clearSessionCookie(context.cookies);
  return context.redirect("/", 302);
};
