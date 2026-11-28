import { defineCollection, reference } from "astro:content";
import { z } from "astro/zod";
import { glob } from "astro/loaders";
import { post } from "./content/blog/_schema";

const blog = defineCollection({
  loader: glob({
    pattern: ["**/*.md", "!**/_*.*"],
    base: "./src/content/blog",
  }),
  schema: post,
});

const portfolio = defineCollection({
  loader: glob({ pattern: "**/*.yml", base: "./src/content/portfolio" }),
  schema: ({ image }) =>
    z.object({
      title: z.string().min(1),
      description: z.string().min(1),
      icon: z.string().min(1),
      category: z.enum(["skills", "products", "slides"]),
      order: z.number().int(),
      subtitle: z.string().optional(),
      heroImage: z.string().optional(),
      heroImageContent: image().optional(),
      tags: z.array(z.string()).default([]),
      relation: z
        .array(
          z.object({
            target: reference("portfolio"),
          }),
        )
        .default([]),
      links: z
        .array(
          z.object({
            name: z.string(),
            url: z.string(),
            icon: z.string(),
            primary: z.boolean().optional(),
          }),
        )
        .default([]),
    }),
});

const career = defineCollection({
  loader: glob({ pattern: "**/career.yml", base: "./src/content/career" }),
  schema: z.array(
    z.object({
      organization: z.string(),
      description: z.string(),
      start: z.coerce.date(),
      end: z.coerce.date().optional(),
    }),
  ),
});

export const collections = {
  blog: blog,
  portfolio,
  career: career,
};
