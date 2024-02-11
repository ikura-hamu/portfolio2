import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwind from "@astrojs/tailwind";
import remarkBreaks from 'remark-breaks';
import remarkToc from 'remark-toc';

import icon from "astro-icon";

// https://astro.build/config
export default defineConfig({
  site: 'https://example.com',
  integrations: [mdx(), sitemap(), tailwind(), icon()],
  markdown: {
    remarkPlugins: [remarkBreaks, [remarkToc, {heading: "目次", maxDepth: 3, tight: true, skip: '目次'}]]
  }
});
