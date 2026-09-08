import type { APIRoute } from "astro";
import { randomBytes, createHash } from "node:crypto";
import { config } from "../../../../lib/editor/security";
import { cookieOptions, failure } from "../../../../lib/editor/server";

export const prerender = false;
export const GET: APIRoute = async (context) => {
  try {
    const env = config();
    const state = randomBytes(32).toString("base64url");
    const verifier = randomBytes(32).toString("base64url");
    context.cookies.set("editor_oauth_state", state, {
      ...cookieOptions(),
      maxAge: 600,
    });
    context.cookies.set("editor_oauth_verifier", verifier, {
      ...cookieOptions(),
      maxAge: 600,
    });
    const url = new URL("https://github.com/login/oauth/authorize");
    url.search = new URLSearchParams({
      client_id: env.GITHUB_APP_CLIENT_ID,
      redirect_uri: `${env.EDITOR_ORIGIN}/api/editor/auth/callback`,
      state,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
    }).toString();
    return context.redirect(url.toString(), 302);
  } catch (error) {
    return failure(error);
  }
};
