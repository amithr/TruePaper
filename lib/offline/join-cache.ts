import { idbDelete, idbGet, idbPut } from "@/lib/offline/idb";
import type { CachedJoinDraft } from "@/lib/offline/types";

const JOIN_DRAFT_KEY = "join_draft";

export async function saveJoinDraft(joinCode: string, displayName: string): Promise<void> {
  const record: CachedJoinDraft = {
    key: JOIN_DRAFT_KEY,
    joinCode: joinCode.trim().toUpperCase(),
    displayName: displayName.trim(),
    updatedAt: Date.now(),
  };
  await idbPut("meta", record);
}

export async function loadJoinDraft(): Promise<CachedJoinDraft | null> {
  return idbGet<CachedJoinDraft>("meta", JOIN_DRAFT_KEY);
}

export async function clearJoinDraft(): Promise<void> {
  await idbDelete("meta", JOIN_DRAFT_KEY);
}
