import { getCollection, getEntry } from "astro:content";
import type { APIRoute } from "astro";

export async function getStaticPaths() {
  const posts = await getCollection("blog");
  return posts.map((post) => ({
    params: { slug: post.slug },
    props: post,
  }));
}

export const GET: APIRoute = async ({ params }) => {
  const post = await getEntry("blog", params.slug as string);
  
  if (!post) {
    return new Response("Blog post not found", { status: 404 });
  }

  // Get the raw content body from the collection entry
  const rawContent = post.body;

  // Clean up MDX imports (convert to comments for context)
  const cleanContent = rawContent
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