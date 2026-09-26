/**
 * Routes for the admin SPA.
 *
 * The router is installed on the Vue app in `src/pages/_app.ts`: creating it
 * here is not enough on its own, because `RouterView` and `useRoute()` read
 * values the router only provides once `app.use(router)` has run.
 *
 * Per-route props are deliberately absent - `AdminApp.vue` passes the shared
 * state down through the `RouterView` slot instead, so there is one source.
 */
import {
  createRouter,
  createWebHistory,
  type RouteRecordRaw,
} from "vue-router";
import PostList from "@/components/admin/PostList.vue";
import PostEditor from "@/components/admin/PostEditor.vue";

const routes: RouteRecordRaw[] = [
  { path: "/admin/", name: "list", component: PostList },
  { path: "/admin/new", name: "new", component: PostEditor },
  { path: "/admin/edit/:slug", name: "edit", component: PostEditor },
  { path: "/admin/:pathMatch(.*)*", redirect: "/admin/" },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});
