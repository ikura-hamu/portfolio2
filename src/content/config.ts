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

const work = defineCollection({
	type: "data",
	schema: z.array(z.object({
		title: z.string(),
		description: z.string(),
		heroImage: z.string(),
		tags: z.array(z.string()),
		links: z.array(z.object({
			name: z.string(),
			url: z.string(),
			icon: z.string(),
			primary: z.boolean().optional(),
		})),
	})),
});

export const collections = { "blog": blog, "skill": skill, "work": work };
