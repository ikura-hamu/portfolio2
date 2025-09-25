import { z, type ImageFunction } from "astro:content";

export const post = ({ image }: { image: ImageFunction }) => {
  return z.object({
    title: z.string(),
    description: z.string().optional(),
    // Transform string to Date object
    pubDate: z.date(),
    updatedDate: z.date().optional(),
    heroImage: z.string().optional(),
    heroImageContent: image()
      .refine(() => true)
      .optional(),
    tags: z.array(z.string()).optional(),
  });
};
