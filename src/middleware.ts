/**
 * Gates `/admin/**`. Actions re-check authorization independently, so this is
 * a first line of defence rather than the only one.
 */
import { defineMiddleware } from "astro:middleware";
import { resolveUser } from "./lib/session";

export const onRequest = defineMiddleware(async (context, next) => {
  // Matching the segment, not the prefix: /admin-sw.js and
  // /admin-manifest.webmanifest are public files, not admin pages.
  const path = context.url.pathname;
  const isAdminPage = path === "/admin" || path.startsWith("/admin/");
  const isAction = path.startsWith("/_actions/");

  if (!isAdminPage && !isAction) return next();

  const user = await resolveUser(context);
  context.locals.user = user;

  if (isAdminPage && !user) {
    return context.redirect("/api/auth/github/login", 302);
  }
  return next();
});
