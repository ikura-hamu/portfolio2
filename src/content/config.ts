import { defineCollection, z } from 'astro:content';
import { skills } from './skill/_schema';

const blog = defineCollection({
	type: 'content',
	// Type-check frontmatter using a schema
	schema: z.object({
		title: z.string(),
		description: z.string(),
		// Transform string to Date object
		pubDate: z.coerce.date(),
		updatedDate: z.coerce.date().optional(),
		heroImage: z.string().optional(),
	}),
});

const skill = defineCollection({
	type: "data",
	schema: skills,
})

export const collections = { blog, skill };
