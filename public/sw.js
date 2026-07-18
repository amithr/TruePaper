const CACHE = "truepaper-shell-v3";
// Student join lives at /join (not /). Pre-cache those shells so a refresh
// while briefly offline doesn't become a browser "couldn't load" page after
// the student has already registered on the teacher's roster.
const SHELL_URLS = [
  "/",
  "/en",
  "/uk",
  "/join",
  "/en/join",
  "/uk/join",
  "/en/join/submitted",
  "/uk/join/submitted",
];
const OFFLINE_DB = "truepaper-offline-v1";
const OFFLINE_SYNC_TAG = "truepaper-offline-sync";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .catch(() => undefined),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

function shouldBypassServiceWorker(request) {
  if (request.method !== "GET") {
    return true;
  }
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return true;
  }
  if (url.pathname.startsWith("/api/")) {
    return true;
  }
  if (
    url.searchParams.has("_rsc") ||
    request.headers.get("RSC") === "1" ||
    request.headers.get("Next-Router-Prefetch") === "1" ||
    request.headers.get("Next-Router-State-Tree") != null ||
    request.headers.get("Next-Action") != null
  ) {
    return true;
  }
  return false;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (shouldBypassServiceWorker(request)) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && response.type === "basic") {
          const clone = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached ?? fetch(request))),
  );
});

function openOfflineDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(OFFLINE_DB, 3);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
  });
}

function idbGetAll(db, store) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

function idbDelete(db, store, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(store).delete(key);
  });
}

async function drainSyncItem(item) {
  const res = await fetch(`/api/public/live-sessions/${item.liveSessionId}/responses`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      deviceId: item.deviceId,
      displayName: item.displayName,
      answers: item.answers,
      submissionId: item.submissionId,
    }),
  });
  return res.ok;
}

async function drainFinishItem(item) {
  const saveRes = await fetch(`/api/public/live-sessions/${item.liveSessionId}/responses`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      deviceId: item.deviceId,
      displayName: item.displayName,
      answers: item.answers,
      submissionId: item.submissionId,
    }),
  });
  if (!saveRes.ok) {
    return false;
  }
  const finishRes = await fetch(`/api/public/live-sessions/${item.liveSessionId}/finish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      deviceId: item.deviceId,
      displayName: item.displayName,
    }),
  });
  return finishRes.ok;
}

async function drainFeedbackItem(item) {
  const res = await fetch(
    `/api/forms/live-sessions/${item.liveSessionId}/participants/${encodeURIComponent(
      item.studentDeviceId,
    )}/feedback-items`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: item.id,
        questionId: item.questionId,
        body: item.body,
        createdAt: new Date(item.createdAt).toISOString(),
        responseVersionTag: item.responseVersionTag,
        anchor: item.anchor,
      }),
    },
  );
  return res.ok;
}

async function drainOfflineQueues() {
  let db;
  try {
    db = await openOfflineDb();
  } catch {
    return;
  }

  const syncItems = await idbGetAll(db, "sync_queue");
  for (const item of syncItems) {
    try {
      if (await drainSyncItem(item)) {
        await idbDelete(db, "sync_queue", item.submissionId);
      }
    } catch {
      /* retry on next sync */
    }
  }

  const finishItems = await idbGetAll(db, "finish_queue");
  for (const item of finishItems) {
    try {
      if (await drainFinishItem(item)) {
        await idbDelete(db, "finish_queue", item.key);
      }
    } catch {
      /* retry on next sync */
    }
  }

  // Teacher feedback: lower priority than answers/finish. Best-effort booster
  // only — the in-page engine owns backoff and the "failed" surface, so we skip
  // items already flagged failed and never re-mark here.
  let feedbackItems = [];
  try {
    feedbackItems = await idbGetAll(db, "feedback_queue");
  } catch {
    feedbackItems = [];
  }
  for (const item of feedbackItems) {
    if (item.status === "failed") {
      continue;
    }
    try {
      if (await drainFeedbackItem(item)) {
        await idbDelete(db, "feedback_queue", item.id);
      }
    } catch {
      /* retry on next sync */
    }
  }
}

self.addEventListener("sync", (event) => {
  if (event.tag === OFFLINE_SYNC_TAG) {
    event.waitUntil(drainOfflineQueues());
  }
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "DRAIN_OFFLINE_SYNC") {
    event.waitUntil(drainOfflineQueues());
  }
});
