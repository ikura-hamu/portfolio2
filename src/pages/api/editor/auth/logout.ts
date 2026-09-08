import type { APIRoute } from "astro";
import { config, requireOrigin } from "../../../../lib/editor/security";
import {
  requireAuth,
  SESSION_COOKIE,
  failure,
} from "../../../../lib/editor/server";
export const prerender = false;
export const POST: APIRoute = async (context) => {
  try {
    requireAuth(context);
    requireOrigin(context.request, config().EDITOR_ORIGIN);
    context.cookies.delete(SESSION_COOKIE, { path: "/" });
    return context.redirect("/admin/editor", 303);
  } catch (error) {
    return failure(error);
  }
};
