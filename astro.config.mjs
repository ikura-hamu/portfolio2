import { defineConfig } from "astro/config";
import { unified } from "@astrojs/markdown-remark";
import sitemap from "@astrojs/sitemap";
import rehypeOGCard from "rehype-og-card";
import remarkBreaks from "remark-breaks";
import remarkToc from "remark-toc";

import icon from "astro-icon";
import { SHIKI_THEME } from "./src/consts";

import vercel from "@astrojs/vercel";

import tailwindcss from "@tailwindcss/vite";
import rehypeOGCardShowURL from "./src/plugins/rehype-og-card-show-url.mjs";

// https://astro.build/config
export default defineConfig({
  site: "https://ikura-hamu.work",
  integrations: [sitemap(), icon()],

  markdown: {
    processor: unified({
      rehypePlugins: [
        [
          rehypeOGCard,
          {
            buildCache: true,
            buildCachePath: "./node_modules/.astro",
            enableSameTextURLConversion: true,
            openInNewTab: true,
            serverCache: true,
            serverCachePath: "./public",
            shortenURL: true,
          },
        ],
        rehypeOGCardShowURL,
      ],
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
    }),
    shikiConfig: {
      theme: SHIKI_THEME,
    },
    syntaxHighlight: "shiki",
  },

  output: "static",

  adapter: vercel({
    webAnalytics: { enabled: true },
  }),

  vite: {
    plugins: [tailwindcss()],
  },
});
