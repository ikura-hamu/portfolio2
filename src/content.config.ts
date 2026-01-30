import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";
import { skills } from "./content/skill/_schema";
import { post } from "./content/blog/_schema";

const blog = defineCollection({
  loader: glob({ pattern: ["**/*.{md,mdx}", "!**/_*.*"], base: "./src/content/blog" }),
  schema: post,
});

const skill = defineCollection({
  loader: glob({ pattern: "**/skills.yml", base: "./src/content/skill" }),
  schema: skills,
});

const work = defineCollection({
  loader: glob({ pattern: "**/*.yml", base: "./src/content/work" }),
  schema: ({ image }) =>
    z.array(
      z.object({
        title: z.string(),
        subtitle: z.string().optional(),
        description: z.string(),
        heroImage: z.string().optional(),
        heroImageContent: image().optional(),
        tags: z.array(z.string()),
        links: z.array(
          z.object({
            name: z.string(),
            url: z.string(),
            icon: z.string(),
            primary: z.boolean().optional(),
          }),
        ),
      }),
    ),
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
  skill: skill,
  work: work,
  career: career,
};
