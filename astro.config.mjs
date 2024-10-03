import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import tailwind from "@astrojs/tailwind";
import remarkBreaks from "remark-breaks";
import remarkToc from "remark-toc";

import icon from "astro-icon";
import { SHIKI_THEME } from "./src/consts";

import vercel from "@astrojs/vercel/static";

// https://astro.build/config
export default defineConfig({
  site: "https://ikura-hamu.work",
  integrations: [mdx(), sitemap(), tailwind(), icon()],
  markdown: {
    remarkPlugins: [
      remarkBreaks,
      [
        remarkToc,
        {
          heading: "目次",
          maxDepth: 3,
          tight: true,
          skip: "目次",
        },
      ],
    ],
    shikiConfig: {
      theme: SHIKI_THEME,
    },
  },
  output: "static",
  adapter: vercel({
    webAnalytics: { enabled: true },
  }),
});
