import { type CollectionEntry, getCollection } from "astro:content";
import fs from 'fs';
import path from 'path';
import type { APIRoute } from "astro";

export async function getStaticPaths() {
  const posts = await getCollection("blog");
  return posts.map((post) => ({
    params: { slug: post.slug },
    props: post,
  }));
}

export const GET: APIRoute = async ({ props }) => {
  const post = props as CollectionEntry<"blog">;

  // Read the raw MDX file content
  const filePath = path.join(process.cwd(), 'src', 'content', 'blog', `${post.id}`);
  let rawContent: string;
  try {
    rawContent = fs.readFileSync(filePath, 'utf-8');
  } catch (error) {
    rawContent = `# ${post.data.title}

Error: Could not read source file.

Published: ${post.data.pubDate.toLocaleDateString("ja-JP")}
${post.data.description ? `\nDescription: ${post.data.description}` : ''}
${post.data.tags ? `\nTags: ${post.data.tags.join(', ')}` : ''}
`;
  }

  // Remove frontmatter and clean up for markdown output
  const contentWithoutFrontmatter = rawContent.replace(/^---\n[\s\S]*?\n---\n/, '');

  // Clean up MDX imports (convert to comments for context)
  const cleanContent = contentWithoutFrontmatter
    .replace(/^import .* from .*$/gm, '<!-- $& -->')
    .replace(/^export .*/gm, '<!-- $& -->');

  const finalContent = `# ${post.data.title}

**Published:** ${post.data.pubDate.toLocaleDateString("ja-JP")}
${post.data.description ? `**Description:** ${post.data.description}\n` : ''}${post.data.tags ? `**Tags:** ${post.data.tags.join(', ')}\n` : ''}

---

${cleanContent}`;

  return new Response(finalContent, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
};