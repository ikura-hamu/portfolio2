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
		subtitle: z.string().optional(),
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

const career = defineCollection({
	type: "data",
	schema: z.array(z.object({
		organization: z.string(),
		description: z.string(),
		start: z.coerce.date(),
		end: z.coerce.date().optional(),
	}))
})

export const collections = { "blog": blog, "skill": skill, "work": work, "career": career };
