import { defineConfig } from "astro/config";
import { unified } from "@astrojs/markdown-remark";
import sitemap from "@astrojs/sitemap";
import remarkBreaks from "remark-breaks";
import remarkLinkCard from "remark-link-card-plus";
import remarkToc from "remark-toc";

import icon from "astro-icon";
import { SHIKI_THEME } from "./src/consts";

import vercel from "@astrojs/vercel";

import tailwindcss from "@tailwindcss/vite";
import remarkLinkCardShowURL from "./src/plugins/remark-link-card-show-url.mjs";

// https://astro.build/config
export default defineConfig({
  site: "https://ikura-hamu.work",
  integrations: [sitemap(), icon()],

  markdown: {
    processor: unified({
      remarkPlugins: [
        remarkLinkCardShowURL,
        [
          remarkLinkCard,
          {
            cache: true,
            shortenUrl: true,
            thumbnailPosition: "right",
          },
        ],
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
