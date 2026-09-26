/**
 * Server actions for the admin UI.
 *
 * Authorization is resolved once, by the middleware, which runs for every
 * `/_actions/` request and stores the user in `locals.user`; each action
 * rejects the call when it is absent. No action accepts a repository or a
 * free-form path: callers supply a slug and the backend derives every write
 * target from it.
 */
import { ActionError, defineAction } from "astro:actions";
import { z } from "astro/zod";
import { BACKEND_KIND, getBackend } from "@/lib/backend";
import { UnsafePathError, isValidSlug } from "@/lib/paths";
import { AUTH_MODE } from "@/lib/session";
import { CONTENT_REPO } from "astro:env/server";
import type { APIContext } from "astro";

function requireUser(context: Pick<APIContext, "locals">) {
  const user = context.locals.user;
  if (!user) {
    throw new ActionError({
      code: "UNAUTHORIZED",
      message: "管理画面へのアクセス権がありません。",
    });
  }
  return user;
}

function toActionError(error: unknown): never {
  if (error instanceof ActionError) throw error;
  if (error instanceof UnsafePathError) {
    throw new ActionError({ code: "BAD_REQUEST", message: error.message });
  }
  // The message can carry GitHub API response bodies, so it stays in the
  // server log and the client only gets a fixed message.
  console.error("[admin action]", error);
  throw new ActionError({
    code: "INTERNAL_SERVER_ERROR",
    message: "サーバーでエラーが発生しました。",
  });
}

const slugSchema = z
  .string()
  .min(1)
  .max(100)
  .refine(isValidSlug, "slug は [A-Za-z0-9_-] のみ使用できます。");

const frontmatterSchema = z
  .object({
    title: z.string(),
    description: z.string().optional(),
    pubDate: z.string().optional(),
    updatedDate: z.string().optional(),
    heroImage: z.string().optional(),
    heroImageContent: z.string().optional(),
    tags: z.array(z.string()).optional(),
  })
  .passthrough();

const imageSchema = z.object({
  name: z.string().min(1).max(255),
  contentBase64: z.string().min(1),
});

const saveFields = {
  slug: slugSchema,
  layout: z.enum(["flat", "directory"]),
  frontmatter: frontmatterSchema,
  body: z.string(),
  images: z.array(imageSchema).max(50).default([]),
  deletions: z.array(z.string()).max(50).default([]),
  message: z.string().max(200).optional(),
};

/** A new post has no prior version to conflict with. */
const createSchema = z.object(saveFields);

/** Required, so an update can never skip the conflict check by omitting it. */
const updateSchema = z.object({ ...saveFields, baseSha: z.string().min(1) });

export const server = {
  /** Environment info the UI needs to decide what to show. */
  getEnvironment: defineAction({
    handler: async (_input, context) => {
      const user = requireUser(context);
      return {
        backend: BACKEND_KIND,
        authMode: AUTH_MODE,
        // Linked from the admin header. Unset in local mode, where saves go
        // to the working tree rather than to a repository.
        repository:
          CONTENT_REPO && /^[\w.-]+\/[\w.-]+$/.test(CONTENT_REPO)
            ? CONTENT_REPO
            : null,
        user: { id: user.id, login: user.login, avatarUrl: user.avatarUrl },
      };
    },
  }),

  listPosts: defineAction({
    input: z
      .object({
        offset: z.number().int().min(0).optional(),
        // Capped so a caller cannot ask for an unbounded response.
        limit: z.number().int().min(1).max(200).optional(),
      })
      .default({}),
    handler: async (input, context) => {
      requireUser(context);
      try {
        return await (await getBackend()).listPosts(input);
      } catch (error) {
        toActionError(error);
      }
    },
  }),

  getPost: defineAction({
    input: z.object({ slug: slugSchema }),
    handler: async ({ slug }, context) => {
      requireUser(context);
      try {
        const post = await (await getBackend()).getPost(slug);
        if (!post) {
          throw new ActionError({
            code: "NOT_FOUND",
            message: `記事が見つかりません: ${slug}`,
          });
        }
        return post;
      } catch (error) {
        toActionError(error);
      }
    },
  }),

  createPost: defineAction({
    input: createSchema,
    handler: async (input, context) => {
      requireUser(context);
      try {
        return await (
          await getBackend()
        ).savePost({ ...input, baseSha: "" }, true);
      } catch (error) {
        toActionError(error);
      }
    },
  }),

  updatePost: defineAction({
    input: updateSchema,
    handler: async (input, context) => {
      requireUser(context);
      try {
        return await (await getBackend()).savePost(input, false);
      } catch (error) {
        toActionError(error);
      }
    },
  }),

  /** Deletes the working branch of an unpublished draft. Published posts are refused. */
  discardDraft: defineAction({
    input: z.object({ slug: slugSchema }),
    handler: async ({ slug }, context) => {
      requireUser(context);
      try {
        return await (await getBackend()).discardDraft(slug);
      } catch (error) {
        toActionError(error);
      }
    },
  }),
};
