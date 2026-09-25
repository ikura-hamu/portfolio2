/** Exchanges the OAuth code for an identity and issues the session cookie. */
import type { APIRoute } from "astro";
import { env } from "@/lib/env";
import {
  STATE_COOKIE,
  isAllowed,
  seal,
  setSessionCookie,
  type SessionUser,
} from "@/lib/session";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const code = context.url.searchParams.get("code");
  const state = context.url.searchParams.get("state");
  const expectedState = context.cookies.get(STATE_COOKIE)?.value;
  context.cookies.delete(STATE_COOKIE, { path: "/" });

  if (!code || !state || !expectedState || state !== expectedState) {
    return new Response("Invalid OAuth state.", { status: 400 });
  }

  const clientId = env.GITHUB_OAUTH_CLIENT_ID;
  const clientSecret = env.GITHUB_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return new Response("OAuth app is not configured.", { status: 500 });
  }

  const tokenResponse = await fetch(
    "https://github.com/login/oauth/access_token",
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: new URL(
          "/api/auth/github/callback",
          context.url.origin,
        ).toString(),
      }),
    },
  );

  const tokenData = (await tokenResponse.json()) as { access_token?: string };
  if (!tokenData.access_token) {
    return new Response("Failed to obtain an access token.", { status: 502 });
  }

  const userResponse = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!userResponse.ok) {
    return new Response("Failed to read the GitHub profile.", { status: 502 });
  }

  const profile = (await userResponse.json()) as {
    id: number;
    login: string;
    avatar_url?: string;
  };
  const user: SessionUser = {
    id: profile.id,
    login: profile.login,
    avatarUrl: profile.avatar_url,
  };

  // The OAuth token itself is discarded here; it was only used to prove identity.
  if (!isAllowed(user)) {
    return new Response(
      "このアカウントには管理画面へのアクセス権がありません。",
      {
        status: 403,
      },
    );
  }

  setSessionCookie(context.cookies, await seal(user));
  return context.redirect("/admin/", 302);
};
