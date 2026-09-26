import { defineConfig, globalIgnores } from "eslint/config";
import eslintPluginAstro from "eslint-plugin-astro";
import eslintPluginVue from "eslint-plugin-vue";
import eslintConfigPrettier from "eslint-config-prettier/flat";
import tseslint from "typescript-eslint";

export default defineConfig([
  // Build output and generated files. `.vercel/output` holds bundled server
  // code, which is not ours to lint.
  globalIgnores(["dist/", ".astro/", ".vercel/", ".playwright/"]),

  tseslint.configs.recommended,
  eslintPluginAstro.configs.recommended,
  eslintPluginVue.configs["flat/recommended"],

  // `<script setup lang="ts">` blocks go through the TypeScript parser.
  {
    files: ["**/*.vue"],
    languageOptions: {
      parserOptions: { parser: tseslint.parser },
    },
  },

  // Formatting is Prettier's job; this turns off the rules that would fight
  // it, including the layout rules in eslint-plugin-vue's recommended set.
  eslintConfigPrettier,
]);
