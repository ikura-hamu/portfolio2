import { defineConfig, envField } from "astro/config";
import { unified } from "@astrojs/markdown-remark";
import sitemap from "@astrojs/sitemap";
import remarkLinkCard from "remark-link-card-plus";

import icon from "astro-icon";
import vue from "@astrojs/vue";
import { SHIKI_THEME } from "./src/consts";

import vercel from "@astrojs/vercel";

import tailwindcss from "@tailwindcss/vite";
import remarkLinkCardShowURL from "./src/plugins/remark-link-card-show-url.mjs";
import { sharedRemarkPlugins } from "./src/lib/markdown/shared.mjs";

// https://astro.build/config
export default defineConfig({
  site: "https://ikura-hamu.work",
  // The app entrypoint installs the admin router; without it RouterView has
  // nothing to read and hydration fails.
  integrations: [sitemap(), icon(), vue({ appEntrypoint: "/src/pages/_app" })],

  markdown: {
    processor: unified({
      remarkPlugins: [
        remarkLinkCardShowURL,
        [
          remarkLinkCard,
          {
            cache: false,
            shortenUrl: true,
            thumbnailPosition: "right",
          },
        ],
        // remark-breaks and remark-toc are shared with the admin preview so
        // that both renderers stay in step. Their order must not change.
        ...sharedRemarkPlugins,
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
      GITHUB_APP_CLIENT_ID: envField.string({
        context: "server",
        access: "secret",
        optional: true,
      }),
      GITHUB_APP_CLIENT_SECRET: envField.string({
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
