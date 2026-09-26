/**
 * Remark plugins shared between the production Astro pipeline and the
 * admin preview that runs in the browser.
 *
 * Only plugins that work without Node APIs or network access belong here.
 * `remark-link-card-plus` fetches OGP metadata, so it stays in astro.config.mjs
 * and the admin preview renders a placeholder instead.
 */
import remarkBreaks from "remark-breaks";
import remarkToc from "remark-toc";

export const TOC_OPTIONS = {
  heading: "目次",
  maxDepth: 3,
  tight: true,
  skip: "目次",
};

/** Applied after the link-card plugins in production, and on their own in the admin preview. */
export const sharedRemarkPlugins = [remarkBreaks, [remarkToc, TOC_OPTIONS]];
