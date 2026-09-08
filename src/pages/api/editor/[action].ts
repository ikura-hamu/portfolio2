import type { APIRoute } from "astro";
import { repository } from "../../../lib/editor/github";
import {
  requireAuth,
  requestBody,
  json,
  failure,
} from "../../../lib/editor/server";
import {
  config,
  EditorError,
  requireOrigin,
} from "../../../lib/editor/security";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  try {
    requireAuth(context);
    const repo = await repository();
    const ref = context.url.searchParams.get("branch") ?? "main";
    switch (context.params.action) {
      case "list":
        return json({ paths: await repo.list(ref) });
      case "branches":
        return json({ branches: await repo.branches() });
      case "read":
        return json(
          await repo.read(context.url.searchParams.get("path") ?? "", ref),
        );
      default:
        return json({ error: "見つかりません。" }, 404);
    }
  } catch (error) {
    return failure(error);
  }
};

export const POST: APIRoute = async (context) => {
  try {
    requireAuth(context);
    requireOrigin(context.request, config().EDITOR_ORIGIN);
    const body = await requestBody(context.request);
    const repo = await repository();
    if (context.params.action === "start") {
      if (typeof body.path !== "string" && typeof body.slug !== "string")
        throw new EditorError(400, "記事またはslugを指定してください。");
      return json(
        await repo.start({
          path: typeof body.path === "string" ? body.path : undefined,
          slug: typeof body.slug === "string" ? body.slug : undefined,
        }),
      );
    }
    if (context.params.action === "save") {
      if (
        typeof body.path !== "string" ||
        typeof body.branch !== "string" ||
        typeof body.source !== "string" ||
        !(
          body.sha === null ||
          (typeof body.sha === "string" && /^[a-f0-9]{40}$/.test(body.sha))
        )
      )
        throw new EditorError(400, "保存内容を確認してください。");
      try {
        return json(
          await repo.save({
            path: body.path,
            branch: body.branch,
            source: body.source,
            sha: body.sha,
          }),
        );
      } catch (error) {
        if (error instanceof EditorError) throw error;
        if (
          error instanceof Error &&
          !["TimeoutError", "AbortError", "TypeError"].includes(error.name)
        )
          throw new EditorError(400, error.message);
        throw error;
      }
    }
    return json({ error: "見つかりません。" }, 404);
  } catch (error) {
    return failure(error);
  }
};
