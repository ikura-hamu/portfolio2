<script setup lang="ts">
/**
 * The bar above every admin screen: a way home, the content repository, and
 * the theme toggle.
 *
 * The theme is shared with the public site through `localStorage.theme` and
 * `<html data-theme>`, so toggling here carries over to the site and back.
 * The editor watches `data-theme` and restyles itself.
 */
import { ref } from "vue";
import { RouterLink } from "vue-router";

defineProps<{
  /** `owner/repo`, or null when no repository is configured (local mode). */
  repository: string | null;
}>();

type Theme = "light" | "dark";

function currentTheme(): Theme {
  return document.documentElement.getAttribute("data-theme") === "dark"
    ? "dark"
    : "light";
}

const theme = ref<Theme>(currentTheme());

function toggleTheme() {
  const next: Theme = currentTheme() === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  try {
    localStorage.setItem("theme", next);
  } catch {
    // Storage can be blocked; the choice then lasts until the next load.
  }
  theme.value = next;
}

// Remix Icon paths (ri:github-line, ri:sun-line, ri:moon-line), the set the
// public site's theme toggle uses.
const GITHUB_ICON =
  "M5.884 18.653c-.3-.2-.558-.455-.86-.816a51 51 0 0 1-.466-.579c-.463-.575-.755-.841-1.056-.95a1 1 0 1 1 .675-1.882c.752.27 1.261.735 1.947 1.588c-.094-.117.34.427.433.539c.19.227.33.365.44.438c.204.137.588.196 1.15.14c.024-.382.094-.753.202-1.095c-2.968-.726-4.648-2.64-4.648-6.396c0-1.24.37-2.356 1.058-3.292c-.218-.894-.185-1.975.302-3.192a1 1 0 0 1 .63-.582c.081-.024.127-.035.208-.047c.803-.124 1.937.17 3.415 1.096a11.7 11.7 0 0 1 2.687-.308c.912 0 1.819.104 2.684.308c1.477-.933 2.614-1.227 3.422-1.096q.128.02.218.05a1 1 0 0 1 .616.58c.487 1.216.52 2.296.302 3.19c.691.936 1.058 2.045 1.058 3.293c0 3.757-1.674 5.665-4.642 6.392c.125.415.19.878.19 1.38c0 .665-.002 1.299-.007 2.01c0 .19-.002.394-.005.706a1 1 0 0 1-.018 1.958c-1.14.227-1.984-.532-1.984-1.525l.002-.447l.005-.705c.005-.707.008-1.337.008-1.997c0-.697-.184-1.152-.426-1.361c-.661-.57-.326-1.654.541-1.751c2.966-.333 4.336-1.482 4.336-4.66c0-.955-.312-1.744-.913-2.404A1 1 0 0 1 17.2 6.19c.166-.414.236-.957.095-1.614l-.01.003c-.491.139-1.11.44-1.858.949a1 1 0 0 1-.833.135a9.6 9.6 0 0 0-2.592-.349c-.89 0-1.772.118-2.592.35a1 1 0 0 1-.829-.134c-.753-.507-1.374-.807-1.87-.947c-.143.653-.072 1.194.093 1.607a1 1 0 0 1-.189 1.045c-.597.655-.913 1.458-.913 2.404c0 3.172 1.371 4.328 4.322 4.66c.865.097 1.202 1.177.545 1.748c-.193.168-.43.732-.43 1.364v3.15c0 .985-.834 1.725-1.96 1.528a1 1 0 0 1-.04-1.962v-.99c-.91.061-1.661-.088-2.254-.485";
const SUN_ICON =
  "M12 18a6 6 0 1 1 0-12a6 6 0 0 1 0 12m0-2a4 4 0 1 0 0-8a4 4 0 0 0 0 8M11 1h2v3h-2zm0 19h2v3h-2zM3.515 4.929l1.414-1.414L7.05 5.636L5.636 7.05zM16.95 18.364l1.414-1.414l2.121 2.121l-1.414 1.414zm2.121-14.85l1.414 1.415l-2.121 2.121l-1.414-1.414zM5.636 16.95l1.414 1.414l-2.121 2.121l-1.414-1.414zM23 11v2h-3v-2zM4 11v2H1v-2z";
const MOON_ICON =
  "M10 7a7 7 0 0 0 12 4.9v.1c0 5.523-4.477 10-10 10S2 17.523 2 12S6.477 2 12 2h.1A6.98 6.98 0 0 0 10 7m-6 5a8 8 0 0 0 15.062 3.762A9 9 0 0 1 8.238 4.938A8 8 0 0 0 4 12";
</script>

<template>
  <header class="admin-border flex items-center gap-2 border-b px-3 py-1.5">
    <RouterLink to="/admin/" class="text-sm font-bold hover:opacity-80">
      ブログ管理画面
    </RouterLink>
    <span class="grow" />
    <a
      v-if="repository"
      :href="`https://github.com/${repository}`"
      target="_blank"
      rel="noopener noreferrer"
      class="flex items-center gap-1 rounded px-1.5 py-1 text-sm hover:opacity-80"
      :title="`${repository} を GitHub で開く`"
    >
      <svg viewBox="0 0 24 24" class="size-5" aria-hidden="true">
        <path fill="currentColor" :d="GITHUB_ICON" />
      </svg>
      <span class="hidden sm:inline">{{ repository }}</span>
      <span class="sr-only sm:hidden">GitHub リポジトリ</span>
    </a>
    <!-- Like the public site's toggle, it shows the theme it switches to. -->
    <button
      type="button"
      class="rounded p-1"
      :aria-label="
        theme === 'dark' ? 'ライトモードに切り替え' : 'ダークモードに切り替え'
      "
      :title="
        theme === 'dark' ? 'ライトモードに切り替え' : 'ダークモードに切り替え'
      "
      @click="toggleTheme"
    >
      <svg viewBox="0 0 24 24" class="size-5" aria-hidden="true">
        <path
          fill="currentColor"
          :d="theme === 'dark' ? SUN_ICON : MOON_ICON"
        />
      </svg>
    </button>
  </header>
</template>
