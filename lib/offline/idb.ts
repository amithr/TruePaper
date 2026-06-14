const DB_NAME = "truepaper-offline-v1";
const DB_VERSION = 2;

export type StoreName = "answers" | "sync_queue" | "session_cache" | "meta" | "finish_queue";

type UpgradeCallback = (db: IDBDatabase) => void;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(onUpgrade?: UpgradeCallback): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB unavailable"));
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error ?? new Error("IDB open failed"));
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("answers")) {
          db.createObjectStore("answers", { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains("sync_queue")) {
          const q = db.createObjectStore("sync_queue", { keyPath: "submissionId" });
          q.createIndex("by_session", ["liveSessionId", "deviceId"], { unique: false });
          q.createIndex("by_created", "createdAt", { unique: false });
        }
        if (!db.objectStoreNames.contains("session_cache")) {
          db.createObjectStore("session_cache", { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta", { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains("finish_queue")) {
          db.createObjectStore("finish_queue", { keyPath: "key" });
        }
        onUpgrade?.(db);
      };
    });
  }
  return dbPromise;
}

export function sessionDeviceKey(liveSessionId: string, deviceId: string): string {
  return `${liveSessionId}::${deviceId.toLowerCase()}`;
}

export async function idbGet<T>(store: StoreName, key: string): Promise<T | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readonly");
      const req = tx.objectStore(store).get(key);
      req.onsuccess = () => resolve((req.result as T | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function idbPut<T>(store: StoreName, value: T): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(store).put(value);
  });
}

export async function idbDelete(store: StoreName, key: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(store).delete(key);
  });
}

export async function idbGetAllByIndex<T>(
  store: StoreName,
  indexName: string,
  query: IDBKeyRange | string,
): Promise<T[]> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readonly");
      const idx = tx.objectStore(store).index(indexName);
      const req = idx.getAll(query);
      req.onsuccess = () => resolve((req.result as T[]) ?? []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function idbGetAll<T>(store: StoreName): Promise<T[]> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readonly");
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => resolve((req.result as T[]) ?? []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function isIdbAvailable(): Promise<boolean> {
  try {
    await openDb();
    return true;
  } catch {
    return false;
  }
}
