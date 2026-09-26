/**
 * Thin wrapper around `astro:actions` so components deal with plain values
 * and a single error shape.
 */
import { actions } from "astro:actions";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * The message to show for a caught error. `offlineMessage` replaces the
 * browser's own network error text, which says nothing useful to the user.
 */
export function errorMessage(error: unknown, offlineMessage?: string): string {
  if (
    offlineMessage !== undefined &&
    error instanceof ApiError &&
    error.code === "NETWORK"
  ) {
    return offlineMessage;
  }
  return error instanceof Error ? error.message : String(error);
}

/** The shape `astro:actions` reports failures with. */
interface ActionFailure {
  message?: string;
  code?: string;
}

async function unwrap<T>(
  promise: Promise<{ data?: T; error?: ActionFailure }>,
): Promise<T> {
  let result;
  try {
    result = await promise;
  } catch (error) {
    // Network failure: the caller decides whether to fall back to local data.
    throw new ApiError(errorMessage(error), "NETWORK");
  }
  if (result.error) {
    throw new ApiError(
      result.error.message ?? "不明なエラー",
      result.error.code,
    );
  }
  return result.data as T;
}

export const api = {
  getEnvironment: () => unwrap(actions.getEnvironment()),
  listPosts: (options: { offset?: number; limit?: number } = {}) =>
    unwrap(actions.listPosts(options)),
  getPost: (slug: string) => unwrap(actions.getPost({ slug })),
  createPost: (input: Parameters<typeof actions.createPost>[0]) =>
    unwrap(actions.createPost(input)),
  updatePost: (input: Parameters<typeof actions.updatePost>[0]) =>
    unwrap(actions.updatePost(input)),
  discardDraft: (slug: string) => unwrap(actions.discardDraft({ slug })),
};
