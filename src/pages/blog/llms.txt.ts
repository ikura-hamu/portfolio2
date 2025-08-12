import { getCollection } from "astro:content";
import type { APIRoute } from "astro";

export const GET: APIRoute = async () => {
  const blogs = (await getCollection("blog")).sort(
    (a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf(),
  );

  // Generate llms.txt format response
  const content = `# ikura-hamu's Blog

> Personal blog by ikura-hamu, covering technology, programming, and project experiences.

This blog contains articles about software development, project experiences, and technical insights. Each post includes detailed markdown content accessible via llms-full.txt endpoints.

## Blog Posts

${blogs.map((post) => `- [${post.data.title}](/blog/${post.slug}/llms-full.txt): ${post.data.description || `Published on ${post.data.pubDate.toLocaleDateString("ja-JP")}`}`).join("\n")}
`;

  // Set content type to text/plain for proper llms.txt format
  return new Response(content, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
};
