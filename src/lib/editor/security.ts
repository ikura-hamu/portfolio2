import { createHmac, timingSafeEqual } from "node:crypto";

export class EditorError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function config() {
  const names = [
    "EDITOR_ORIGIN",
    "EDITOR_SESSION_SECRET",
    "GITHUB_APP_ID",
    "GITHUB_APP_CLIENT_ID",
    "GITHUB_APP_CLIENT_SECRET",
    "GITHUB_APP_PRIVATE_KEY",
    "GITHUB_APP_INSTALLATION_ID",
    "EDITOR_GITHUB_USER_ID",
  ] as const;
  const values = Object.fromEntries(
    names.map((name) => [name, process.env[name]?.trim()]),
  );
  if (
    names.some((name) => !values[name]) ||
    values.EDITOR_SESSION_SECRET!.length < 32
  ) {
    throw new EditorError(503, "エディタの認証設定がまだ完了していません。");
  }
  const origin = new URL(values.EDITOR_ORIGIN!);
  if (
    origin.origin !== values.EDITOR_ORIGIN ||
    (origin.protocol !== "https:" &&
      !(origin.protocol === "http:" && origin.hostname === "localhost"))
  ) {
    throw new EditorError(503, "EDITOR_ORIGINの設定を確認してください。");
  }
  return values as Record<(typeof names)[number], string>;
}

export function signSession(
  subject: string,
  secret: string,
  now = Date.now(),
): string {
  const payload = Buffer.from(
    JSON.stringify({ subject, expires: now + 8 * 60 * 60 * 1000 }),
  ).toString("base64url");
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}

export function validSession(
  value: string | undefined,
  subject: string,
  secret: string,
  now = Date.now(),
): boolean {
  try {
    if (!value || value.length > 1024) return false;
    const parts = value.split(".");
    if (parts.length !== 2) return false;
    const [payload, signature] = parts;
    const expected = createHmac("sha256", secret).update(payload).digest();
    const actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      return false;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    return (
      data.subject === subject &&
      typeof data.expires === "number" &&
      data.expires > now &&
      data.expires <= now + 8 * 60 * 60 * 1000
    );
  } catch {
    return false;
  }
}

export function requireOrigin(request: Request, origin: string): void {
  if (request.headers.get("origin") !== origin)
    throw new EditorError(403, "この画面から操作をやり直してください。");
}

export function validBranch(branch: string): boolean {
  return /^blog\/[a-z0-9][a-z0-9_-]{0,119}-[a-f0-9]{12}$/.test(branch);
}
