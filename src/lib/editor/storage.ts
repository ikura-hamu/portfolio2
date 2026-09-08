import type { Draft } from "./document";

let connection: Promise<IDBDatabase> | undefined;
function database() {
  return (connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("portfolio-blog-editor", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("drafts", { keyPath: "branch" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        new Error(
          "端末内保存を利用できません。原稿をダウンロードしてください。",
        ),
      );
    request.onblocked = () =>
      reject(new Error("他のエディタのタブを閉じて、再読み込みしてください。"));
  }));
}

export async function drafts(): Promise<Draft[]> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db
      .transaction("drafts", "readonly")
      .objectStore("drafts")
      .getAll();
    request.onsuccess = () =>
      resolve(
        (request.result as Draft[]).sort((a, b) => b.updatedAt - a.updatedAt),
      );
    request.onerror = () => reject(request.error);
  });
}

// Compare the previous timestamp in the same transaction, so another tab cannot
// silently replace a newer local draft. Callers serialize writes per document.
export async function persist(
  draft: Draft,
  previousUpdatedAt: number | null,
): Promise<void> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("drafts", "readwrite");
    const store = transaction.objectStore("drafts");
    const request = store.get(draft.branch);
    let conflict = false;
    request.onsuccess = () => {
      const existing = request.result as Draft | undefined;
      if ((existing?.updatedAt ?? null) !== previousUpdatedAt) {
        conflict = true;
        transaction.abort();
        return;
      }
      store.put(draft);
    };
    transaction.oncomplete = () => resolve();
    transaction.onabort = transaction.onerror = () =>
      reject(
        new Error(
          conflict
            ? "別のタブで端末内の原稿が更新されています。この原稿をダウンロードしてから再読み込みしてください。"
            : "端末内に保存できませんでした。原稿をダウンロードしてください。",
        ),
      );
  });
}
