/**
 * Resolves the user for admin pages and actions and stores it in
 * `locals.user`. Admin pages without a user are redirected to sign-in; actions
 * are let through and reject the call themselves when `locals.user` is absent.
 */
import { defineMiddleware } from "astro:middleware";
import { resolveUser } from "./lib/session";
import { getActionContext } from "astro:actions";

export const onRequest = defineMiddleware(async (context, next) => {
  // Matching the segment, not the prefix: /admin-sw.js and
  // /admin-manifest.webmanifest are public files, not admin pages.
  const path = context.url.pathname;
  const isAdminPage = path === "/admin" || path.startsWith("/admin/");
  const actionContext = getActionContext(context);
  const isAction = actionContext.action !== undefined;

  if (!isAdminPage && !isAction) return next();

  const user = await resolveUser(context);
  context.locals.user = user;

  if (isAdminPage && !user) {
    return context.redirect("/api/auth/github/login", 302);
  }
  return next();
});
