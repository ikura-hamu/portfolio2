import { z } from "astro:content";

export const skills = z.array(
  z.object({
    name: z.string(),
    description: z.string(),
    icon: z.string(),
  }),
);
