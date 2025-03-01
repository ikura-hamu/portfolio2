import { z } from 'astro:content'

export const post = z.object({
  title: z.string(),
  description: z.string().optional(),
  // Transform string to Date object
  pubDate: z.coerce.date(),
  updatedDate: z.coerce.date().optional(),
  heroImage: z.string().optional(),
  tags: z.array(z.string()).optional(),
})
