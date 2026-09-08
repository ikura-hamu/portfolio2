import type { APIRoute } from "astro";
import {
  config,
  EditorError,
  signSession,
} from "../../../../lib/editor/security";
import {
  cookieOptions,
  failure,
  SESSION_COOKIE,
} from "../../../../lib/editor/server";
import { githubRequest } from "../../../../lib/editor/github";

export const prerender = false;
export const GET: APIRoute = async (context) => {
  try {
    const env = config();
    const state = context.cookies.get("editor_oauth_state")?.value;
    const verifier = context.cookies.get("editor_oauth_verifier")?.value;
    context.cookies.delete("editor_oauth_state", { path: "/" });
    context.cookies.delete("editor_oauth_verifier", { path: "/" });
    const code = context.url.searchParams.get("code");
    if (
      !state ||
      !verifier ||
      state !== context.url.searchParams.get("state") ||
      !code
    )
      throw new EditorError(403, "ログインをやり直してください。");
    const response = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(15000),
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: env.GITHUB_APP_CLIENT_ID,
          client_secret: env.GITHUB_APP_CLIENT_SECRET,
          code,
          code_verifier: verifier,
          redirect_uri: `${env.EDITOR_ORIGIN}/api/editor/auth/callback`,
        }),
      },
    );
    const result = (await response.json()) as { access_token?: string };
    if (!response.ok || !result.access_token)
      throw new EditorError(
        403,
        "GitHubの認証に失敗しました。ログインをやり直してください。",
      );
    const user = (await githubRequest(result.access_token, "/user")) as {
      id: number;
    };
    if (String(user.id) !== env.EDITOR_GITHUB_USER_ID)
      throw new EditorError(403, "このアカウントはエディタを利用できません。");
    context.cookies.set(
      SESSION_COOKIE,
      signSession(String(user.id), env.EDITOR_SESSION_SECRET),
      { ...cookieOptions(), maxAge: 8 * 60 * 60 },
    );
    return context.redirect("/admin/editor", 303);
  } catch (error) {
    return failure(error);
  }
};
