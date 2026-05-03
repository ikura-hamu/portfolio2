import { z } from "astro/zod";

export const skills = z.array(
  z.object({
    name: z.string(),
    description: z.string(),
    icon: z.string(),
  }),
);
