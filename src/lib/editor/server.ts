import type { APIContext } from "astro";
import { config, EditorError, validSession } from "./security";

export const SESSION_COOKIE = "editor_session";
export function cookieOptions() {
  return {
    httpOnly: true,
    secure: config().EDITOR_ORIGIN.startsWith("https:"),
    sameSite: "lax" as const,
    path: "/",
  };
}
export function authenticated(context: Pick<APIContext, "cookies">): boolean {
  const env = config();
  return validSession(
    context.cookies.get(SESSION_COOKIE)?.value,
    env.EDITOR_GITHUB_USER_ID,
    env.EDITOR_SESSION_SECRET,
  );
}
export function requireAuth(context: APIContext) {
  if (!authenticated(context))
    throw new EditorError(
      401,
      "ログインの有効期限が切れました。原稿を保持したまま、再ログインしてください。",
    );
}
export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
export function failure(error: unknown) {
  if (error instanceof EditorError)
    return json({ error: error.message }, error.status);
  return json(
    {
      error:
        "処理を完了できませんでした。原稿はそのまま保持し、時間をおいて再試行してください。",
    },
    502,
  );
}
export async function requestBody(
  request: Request,
): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new EditorError(415, "JSON形式で送信してください。");
  const reader = request.body?.getReader();
  if (!reader) throw new EditorError(400, "入力がありません。");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 600_000) {
      await reader.cancel();
      throw new EditorError(413, "原稿が大きすぎます。");
    }
    chunks.push(value);
  }
  try {
    const result = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!result || typeof result !== "object" || Array.isArray(result))
      throw new Error();
    return result;
  } catch {
    throw new EditorError(400, "入力を確認してください。");
  }
}
