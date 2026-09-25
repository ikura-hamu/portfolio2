/**
 * Server actions for the admin UI.
 *
 * Every action re-checks authorization rather than trusting the middleware,
 * and no action accepts a repository or a free-form path: callers supply a
 * slug and the backend derives every write target from it.
 */
import { ActionError, defineAction } from "astro:actions";
import { z } from "astro/zod";
import { AUTH_MODE, BACKEND_KIND, getBackend } from "@/lib/backend";
import { UnsafePathError, isValidSlug } from "@/lib/paths";
import { resolveUser } from "@/lib/session";
import type { APIContext } from "astro";

type ActionContext = Pick<APIContext, "cookies" | "url" | "locals">;

async function requireUser(context: ActionContext) {
  const user = context.locals.user ?? (await resolveUser(context));
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
  throw new ActionError({
    code: "INTERNAL_SERVER_ERROR",
    message: error instanceof Error ? error.message : String(error),
  });
}

const slugSchema = z
  .string()
  .min(1)
  .max(100)
  .refine(isValidSlug, "slug は [a-z0-9_-] の小文字のみ使用できます。");

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

const saveSchema = z.object({
  slug: slugSchema,
  layout: z.enum(["flat", "directory"]),
  frontmatter: frontmatterSchema,
  body: z.string(),
  images: z.array(imageSchema).max(50).default([]),
  deletions: z.array(z.string()).max(50).default([]),
  baseSha: z.string().default(""),
  message: z.string().max(200).optional(),
});

export const server = {
  /** Environment info the UI needs to decide what to show. */
  getEnvironment: defineAction({
    handler: async (_input, context) => {
      const user = await requireUser(context);
      return {
        backend: BACKEND_KIND,
        authMode: AUTH_MODE,
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
      await requireUser(context);
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
      await requireUser(context);
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
    input: saveSchema,
    handler: async (input, context) => {
      await requireUser(context);
      try {
        return await (await getBackend()).savePost(input, true);
      } catch (error) {
        toActionError(error);
      }
    },
  }),

  updatePost: defineAction({
    input: saveSchema,
    handler: async (input, context) => {
      await requireUser(context);
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
      await requireUser(context);
      try {
        return await (await getBackend()).discardDraft(slug);
      } catch (error) {
        toActionError(error);
      }
    },
  }),
};
