<script setup lang="ts">
/**
 * Admin SPA shell.
 *
 * Every /admin/* route renders this one component; Vue Router takes over from
 * there. That keeps the service worker able to fall back to a single cached
 * shell when offline.
 */
import { onMounted, ref } from "vue";
import { RouterView } from "vue-router";
import AdminHeader from "./AdminHeader.vue";
import { api } from "@/lib/admin/api";

const online = ref(true);
const isLocal = ref(false);
const repository = ref<string | null>(null);
const toast = ref<{ message: string; kind: "error" | "info" } | null>(null);
let toastTimer: ReturnType<typeof setTimeout> | undefined;

function showToast(message: string, kind: "error" | "info" = "info") {
  toast.value = { message, kind };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.value = null), 6000);
}

onMounted(async () => {
  online.value = navigator.onLine;
  window.addEventListener("online", () => (online.value = true));
  window.addEventListener("offline", () => (online.value = false));

  try {
    const environment = await api.getEnvironment();
    isLocal.value = environment.backend === "local";
    repository.value = environment.repository;
  } catch {
    // Offline on first paint: the UI still works against local drafts.
  }

  if ("serviceWorker" in navigator && import.meta.env.PROD) {
    navigator.serviceWorker
      .register("/admin-sw.js", { scope: "/admin/" })
      .catch(() =>
        showToast("Service Worker を登録できませんでした。", "error"),
      );
  }
});
</script>

<template>
  <div class="admin-root flex min-h-dvh flex-col">
    <AdminHeader :repository="repository" />
    <div
      v-if="isLocal"
      class="shrink-0 bg-amber-300 px-3 py-1 text-center text-sm text-amber-950"
    >
      ローカルモード（GitHub 未接続）—
      保存は作業ツリーのファイルに直接書き込まれます
    </div>
    <div
      v-else-if="!online"
      class="shrink-0 bg-neutral-700 px-3 py-1 text-center text-sm text-white"
    >
      オフライン — 編集はこの端末に保存されます。GitHub
      への保存はオンライン時のみです。
    </div>

    <main class="admin-main flex-1">
      <RouterView v-slot="{ Component }">
        <component
          :is="Component"
          :is-local="isLocal"
          :online="online"
          @toast="showToast"
        />
      </RouterView>
    </main>

    <div
      v-if="toast"
      class="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded px-4 py-2 text-sm shadow-lg"
      :class="
        toast.kind === 'error'
          ? 'bg-red-600 text-white'
          : 'bg-neutral-800 text-white'
      "
    >
      {{ toast.message }}
    </div>
  </div>
</template>
