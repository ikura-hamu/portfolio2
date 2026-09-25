/**
 * Service worker for the admin UI.
 *
 * Scope is /admin/, and anything outside it is passed straight to the network
 * untouched, so the public site is never intercepted. The admin shell is an
 * on-demand route rather than a build artifact, so there is no precache
 * manifest: the caches are filled on the first successful visit instead.
 *
 * Plain JavaScript on purpose - it is self-contained, has no imports, and is
 * served verbatim from public/, so no bundling step can get between the source
 * and what the browser runs.
 */

const SHELL_CACHE = "admin-shell-v1";
const ASSET_CACHE = "admin-assets-v1";
const SHELL_URL = "/admin/";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter(
            (name) =>
              name.startsWith("admin-") &&
              name !== SHELL_CACHE &&
              name !== ASSET_CACHE,
          )
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

/** Requests that must always reach the network, even inside the scope. */
function isPassThrough(url) {
  return (
    url.pathname.startsWith("/_actions/") ||
    url.pathname.startsWith("/api/auth/")
  );
}

function isAdminNavigation(request, url) {
  // The segment, not the prefix: /admin-sw.js and /admin-manifest.webmanifest
  // are ordinary public files.
  const path = url.pathname;
  return (
    request.mode === "navigate" &&
    (path === "/admin" || path.startsWith("/admin/"))
  );
}

/** Build assets the admin app needs in order to boot. */
function isAppAsset(url) {
  return (
    url.pathname.startsWith("/_astro/") ||
    url.pathname.startsWith("/fonts/") ||
    url.pathname === "/admin-manifest.webmanifest" ||
    url.pathname === "/favicon.png"
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isPassThrough(url)) return;

  if (isAdminNavigation(request, url)) {
    event.respondWith(networkFirstShell(request));
    return;
  }

  // Outside /admin/, only the build assets the admin app itself loads are
  // cached. Public pages are left entirely alone.
  if (isAppAsset(url)) {
    event.respondWith(cacheFirst(request));
  }
});

async function networkFirstShell(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    // An unauthenticated request is redirected to the OAuth flow. Caching that
    // response would serve the login page as the offline shell from then on.
    if (response.ok && !response.redirected && isSameOrigin(response.url)) {
      // Every admin route renders the same shell, so one entry is enough.
      await cache.put(SHELL_URL, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(SHELL_URL);
    if (cached) return cached;
    throw error;
  }
}

function isSameOrigin(url) {
  if (!url) return false;
  try {
    return new URL(url).origin === self.location.origin;
  } catch {
    return false;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}
