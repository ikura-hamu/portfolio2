import { writeFileSync } from "fs";
import { createInterface } from "readline/promises";
import { stdin as input, stdout as output } from "process";

const rl = createInterface({ input, output });

async function main() {
  try {
    // Get user input
    const title = await rl.question("title (date is not required): ");
    const description = await rl.question("description (optional): ");
    const tagsInput = await rl.question("tags (comma-separated, optional): ");

    // Parse tags
    const tags = tagsInput.trim()
      ? tagsInput
          .split(",")
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0)
      : [];

    // Generate current date
    const now = new Date();
    const pubDate = now.toISOString();

    // Create slug from title
    // Generate filename with date prefix
    const datePrefix = now
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, "")
      .slice(2); // YYMMDD format
    const slug =
      datePrefix +
      "_" +
      title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .trim();

    // Generate frontmatter
    let frontmatter = `---
title: "${title}"
pubDate: ${pubDate}`;

    if (description.trim()) {
      frontmatter += `\ndescription: "${description}"`;
    }

    if (tags.length > 0) {
      frontmatter += `\ntags: [${tags.map((tag) => `"${tag}"`).join(", ")}]`;
    }

    frontmatter += `\nheroImageContent: "./${slug}.jpg" # optional`;

    frontmatter += "\n---\n\n";

    // Create markdown content
    const content = `${frontmatter}# ${title}

`;

    // Write to file
    const filename = `src/content/blog/${slug}.mdx`;
    writeFileSync(filename, content);
  } catch (error) {
    console.error("エラーが発生しました:", error);
  } finally {
    rl.close();
  }
}

main();
