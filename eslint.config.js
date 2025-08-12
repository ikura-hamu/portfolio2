import eslintPluginAstro from "eslint-plugin-astro";
import typescriptEslintParser from "@typescript-eslint/parser";
import tseslint from "typescript-eslint";

export default [
  {
    languageOptions: {
      parser: typescriptEslintParser,
      parserOptions: {
        project: true,
        sourceType: "module",
      },
    },
  },
  {
    ignores: [".astro/**"],
  },
  ...tseslint.configs.recommended,
  ...eslintPluginAstro.configs.recommended,
];
