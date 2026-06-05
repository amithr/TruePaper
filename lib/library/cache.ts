import type { LibraryBrowseResult, LibraryTemplateSummary } from "@/lib/library/types";

const CACHE_KEY = "tp-template-library-cache-v1";
const MAX_OWN_ITEMS = 40;
const MAX_RECENT_ITEMS = 20;

type CachePayload = {
  ownTemplates: LibraryTemplateSummary[];
  recentTemplates: LibraryTemplateSummary[];
  lastBrowse?: LibraryBrowseResult;
  updatedAt: number;
};

function readCache(): CachePayload {
  if (typeof window === "undefined") {
    return { ownTemplates: [], recentTemplates: [], updatedAt: 0 };
  }
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) {
      return { ownTemplates: [], recentTemplates: [], updatedAt: 0 };
    }
    const parsed = JSON.parse(raw) as CachePayload;
    return {
      ownTemplates: Array.isArray(parsed.ownTemplates) ? parsed.ownTemplates : [],
      recentTemplates: Array.isArray(parsed.recentTemplates) ? parsed.recentTemplates : [],
      lastBrowse: parsed.lastBrowse,
      updatedAt: Number(parsed.updatedAt) || 0,
    };
  } catch {
    return { ownTemplates: [], recentTemplates: [], updatedAt: 0 };
  }
}

function writeCache(payload: CachePayload): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    /* quota exceeded — best effort */
  }
}

export function getCachedOwnTemplates(): LibraryTemplateSummary[] {
  return readCache().ownTemplates;
}

export function getCachedRecentTemplates(): LibraryTemplateSummary[] {
  return readCache().recentTemplates;
}

export function getCachedLastBrowse(): LibraryBrowseResult | undefined {
  return readCache().lastBrowse;
}

export function cacheOwnTemplates(items: LibraryTemplateSummary[]): void {
  const cache = readCache();
  writeCache({
    ...cache,
    ownTemplates: items.slice(0, MAX_OWN_ITEMS),
    updatedAt: Date.now(),
  });
}

export function cacheBrowseResult(result: LibraryBrowseResult): void {
  const cache = readCache();
  writeCache({
    ...cache,
    lastBrowse: result,
    updatedAt: Date.now(),
  });
}

export function touchRecentTemplate(item: LibraryTemplateSummary): void {
  const cache = readCache();
  const next = [item, ...cache.recentTemplates.filter((t) => t.id !== item.id)].slice(
    0,
    MAX_RECENT_ITEMS,
  );
  writeCache({ ...cache, recentTemplates: next, updatedAt: Date.now() });
}

export function mergeBrowseWithCache(
  remote: LibraryBrowseResult | null,
  scope: string,
): LibraryBrowseResult {
  if (remote) {
    cacheBrowseResult(remote);
    if (scope === "mine") {
      cacheOwnTemplates(remote.items);
    }
    return remote;
  }
  const cache = readCache();
  if (scope === "mine" && cache.ownTemplates.length > 0) {
    return {
      items: cache.ownTemplates,
      page: 0,
      pageSize: cache.ownTemplates.length,
      total: cache.ownTemplates.length,
      hasMore: false,
    };
  }
  if (cache.lastBrowse) {
    return cache.lastBrowse;
  }
  return { items: [], page: 0, pageSize: 20, total: 0, hasMore: false };
}
