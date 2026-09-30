// Place any global data in this file.
// You can import this data from anywhere in your site by using the `import` keyword.

export const SITE_TITLE = "いくら・はむ";
export const SITE_DESCRIPTION = "いくらは好きだけど、ハムよりはベーコン。";
export const SHIKI_THEME = "one-dark-pro";

/**
 * Largest action request body the admin accepts, in bytes. Vercel refuses
 * function request bodies over 4.5 MB with a 413, so this stays below that.
 * Images are uploaded one per request, so this bounds a single image.
 */
export const ACTION_BODY_LIMIT = 4 * 1024 * 1024;
