/**
 * Vue app entrypoint, wired up through `vue({ appEntrypoint })` in
 * astro.config.mjs. `@astrojs/vue` awaits this for every Vue island, which is
 * where the admin router gets installed.
 *
 * The leading underscore keeps Astro from treating this as a page.
 */
import type { App } from "vue";
import { router } from "@/lib/admin/router";

export default (app: App) => {
  app.use(router);
};
