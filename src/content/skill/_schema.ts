import { z } from "astro/zod";

export const skills = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  icon: z.string().min(1),
  category: z.enum(["technology", "field"]),
});
