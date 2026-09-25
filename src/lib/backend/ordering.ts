/**
 * Ordering rules shared by the backends so both lists read the same way.
 *
 * Posts are ordered by the `YYMMDD_` prefix their file names carry rather than
 * by anything in the frontmatter. That keeps the whole order derivable from
 * the file listing alone, so a page can be selected before any post is read -
 * which is what makes `offset`/`limit` bound the GitHub requests and not just
 * the response.
 */

const DATE_PREFIX = /^(\d{6})_/;

/** The `YYMMDD` part of a slug, or `undefined` if it does not carry one. */
export function datePrefix(slug: string): string | undefined {
  return DATE_PREFIX.exec(slug)?.[1];
}

export interface Orderable {
  slug: string;
  /** Posts with a working branch, i.e. with work that is not on `main`. */
  isDraft: boolean;
}

/**
 * Drafts first, then the rest; within each group newest first by the date in
 * the file name. A slug without the prefix has no date to sort on, so it goes
 * after the ones that do. Ties fall back to the slug, which keeps paging over
 * an unchanged repository consistent.
 */
export function compareForListing(a: Orderable, b: Orderable): number {
  if (a.isDraft !== b.isDraft) return a.isDraft ? -1 : 1;

  const dateA = datePrefix(a.slug);
  const dateB = datePrefix(b.slug);
  if (dateA !== dateB) {
    if (dateA === undefined) return 1;
    if (dateB === undefined) return -1;
    // Fixed-width digits, so a plain string comparison is a date comparison.
    return dateA < dateB ? 1 : -1;
  }
  if (a.slug === b.slug) return 0;
  return a.slug < b.slug ? 1 : -1;
}

/** Applies `offset`/`limit`, tolerating values that are out of range. */
export function paginate<T>(
  items: T[],
  options: { offset?: number; limit?: number } | undefined,
): T[] {
  const offset = Math.max(0, Math.trunc(options?.offset ?? 0));
  const limit = options?.limit;
  if (limit === undefined) return items.slice(offset);
  return items.slice(offset, offset + Math.max(0, Math.trunc(limit)));
}
