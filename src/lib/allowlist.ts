/**
 * Who may use the admin UI.
 *
 * Kept apart from the session module so the rule can be exercised on its own,
 * and because it depends on nothing but the environment.
 */
import { env } from "./env";
import type { SessionUser } from "./session";

/**
 * The single GitHub account allowed to use the admin UI, as a numeric user id.
 *
 * An id rather than a login name: a login can be changed, and the freed name
 * can then be registered by someone else.
 */
function allowedUserId(): number {
  const raw = env.ALLOWED_GITHUB_USER_ID?.trim();
  if (!raw) {
    // Failing loudly: a missing allowlist is a misconfiguration, and silently
    // denying everyone would look like a redirect loop instead.
    throw new Error(
      "ALLOWED_GITHUB_USER_ID is not set; the admin UI has no allowlist to check against.",
    );
  }
  // Only a plain positive integer: Number() would accept "1e3" or " 12 ", and
  // a GitHub user id is never zero or negative.
  if (!/^[1-9][0-9]*$/.test(raw)) {
    throw new Error(
      `ALLOWED_GITHUB_USER_ID is "${raw}", which is not a GitHub numeric user id.`,
    );
  }
  return Number(raw);
}

/** Whether this account may use the admin UI. Compared by numeric id. */
export function isAllowed(user: SessionUser): boolean {
  return user.id === allowedUserId();
}
