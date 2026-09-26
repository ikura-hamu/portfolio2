import { defineConfig, envField } from "astro/config";
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

  // Admin UI settings. All are server-only secrets, read at runtime rather
  // than inlined into the bundle, and optional: each is checked where it is
  // used, so the public site builds and runs without any of them.
  env: {
    schema: {
      ADMIN_BACKEND: envField.enum({
        context: "server",
        access: "secret",
        values: ["github", "local"],
        optional: true,
      }),
      ADMIN_AUTH: envField.enum({
        context: "server",
        access: "secret",
        values: ["oauth", "bypass"],
        optional: true,
      }),
      SESSION_SECRET: envField.string({
        context: "server",
        access: "secret",
        optional: true,
      }),
      ALLOWED_GITHUB_USER_ID: envField.number({
        context: "server",
        access: "secret",
        int: true,
        gt: 0,
        optional: true,
      }),
      GITHUB_OAUTH_CLIENT_ID: envField.string({
        context: "server",
        access: "secret",
        optional: true,
      }),
      GITHUB_OAUTH_CLIENT_SECRET: envField.string({
        context: "server",
        access: "secret",
        optional: true,
      }),
      GITHUB_APP_ID: envField.string({
        context: "server",
        access: "secret",
        optional: true,
      }),
      GITHUB_APP_PRIVATE_KEY: envField.string({
        context: "server",
        access: "secret",
        optional: true,
      }),
      GITHUB_APP_INSTALLATION_ID: envField.string({
        context: "server",
        access: "secret",
        optional: true,
      }),
      CONTENT_REPO: envField.string({
        context: "server",
        access: "secret",
        optional: true,
      }),
      CONTENT_BRANCH: envField.string({
        context: "server",
        access: "secret",
        optional: true,
      }),
    },
  },

  adapter: vercel({
    webAnalytics: { enabled: true },
  }),

  vite: {
    plugins: [tailwindcss()],
  },
});
