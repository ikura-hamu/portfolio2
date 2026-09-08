import { parseDocument, stringify } from "yaml";

export const BLOG_ROOT = "src/content/blog/";
export const MAX_DOCUMENT_BYTES = 500_000;

export function validSlug(slug: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,119}$/.test(slug);
}

export function articlePath(slug: string): string {
  if (!validSlug(slug))
    throw new Error(
      "slugは英数字・ハイフン・アンダースコアで指定してください。",
    );
  return `${BLOG_ROOT}${slug}/index.md`;
}

export function validArticlePath(path: string): boolean {
  if (!path.startsWith(BLOG_ROOT)) return false;
  const relative = path.slice(BLOG_ROOT.length);
  const slug = relative.endsWith("/index.md")
    ? relative.slice(0, -9)
    : relative.endsWith(".md")
      ? relative.slice(0, -3)
      : "";
  return validSlug(slug);
}

export function splitDocument(source: string) {
  const match = /^(---\r?\n)([\s\S]*?)(\r?\n---)(\r?\n|$)/.exec(source);
  if (!match) throw new Error("先頭に --- で囲んだ記事設定が必要です。");
  const yaml = parseDocument(match[2]);
  if (yaml.errors.length)
    throw new Error(
      `記事設定のYAMLを確認してください: ${yaml.errors[0].message}`,
    );
  const data = yaml.toJS({ maxAliasCount: 20 });
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new Error("記事設定はキーと値で記述してください。");
  return {
    yaml,
    data: data as Record<string, unknown>,
    body: source.slice(match[0].length),
    header: match[0],
  };
}

export function validateDocument(source: string): void {
  if (new TextEncoder().encode(source).length > MAX_DOCUMENT_BYTES)
    throw new Error("Markdownは500KB以下にしてください。");
  const { data } = splitDocument(source);
  if (typeof data.title !== "string" || !data.title.trim())
    throw new Error("タイトルを入力してください。");
  for (const name of ["description", "heroImage", "heroImageContent"]) {
    if (data[name] !== undefined && typeof data[name] !== "string")
      throw new Error(`${name}は文字列にしてください。`);
  }
  for (const name of ["pubDate", "updatedDate"]) {
    if (
      data[name] !== undefined &&
      (typeof data[name] !== "string" ||
        !/^\d{4}-\d{2}-\d{2}(?:$|T| )/.test(data[name]) ||
        !Number.isFinite(Date.parse(data[name])))
    ) {
      throw new Error(`${name}は有効な日付にしてください。`);
    }
  }
  if (
    data.tags !== undefined &&
    (!Array.isArray(data.tags) ||
      data.tags.some((tag) => typeof tag !== "string"))
  )
    throw new Error("tagsは文字列の配列にしてください。");
}

// Do not serialize on load/save: unchanged documents remain byte-for-byte intact.
export function updateMetadata(
  source: string,
  changes: Record<string, string | string[] | undefined>,
): string {
  const { yaml, body, data } = splitDocument(source);
  let changed = false;
  for (const [key, value] of Object.entries(changes)) {
    if (JSON.stringify(data[key]) === JSON.stringify(value)) continue;
    changed = true;
    if (value === undefined) yaml.delete(key);
    else yaml.set(key, value);
  }
  if (!changed) return source;
  const newline = source.startsWith("---\r\n") ? "\r\n" : "\n";
  const header = yaml.toString().replace(/\r?\n/g, newline);
  return `---${newline}${header}---${newline}${body}`;
}

export function newDocument(title: string): string {
  return `---\n${stringify({ title, pubDate: new Date().toISOString() })}---\n\n`;
}

export interface Draft {
  branch: string;
  path: string;
  sha: string | null;
  source: string;
  savedSource: string | null;
  updatedAt: number;
}
