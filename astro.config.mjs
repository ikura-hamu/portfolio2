import { defineConfig } from "astro/config";
import { unified } from "@astrojs/markdown-remark";
import sitemap from "@astrojs/sitemap";
import remarkBreaks from "remark-breaks";
import remarkLinkCard from "remark-link-card-plus";
import remarkToc from "remark-toc";
import { tocOptions } from "./src/lib/markdown-options";

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
        [remarkToc, tocOptions],
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
