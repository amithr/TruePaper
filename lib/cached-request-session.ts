import { cache } from "react";

import { toClientSessionData, type ClientSessionData } from "@/lib/client-session";
import { getSessionUser } from "@/lib/request-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** One Supabase auth lookup per RSC request (shared by layout + page). */
export const getCachedRequestSession = cache(async () => {
  const supabase = await createSupabaseServerClient();
  return getSessionUser(supabase);
});

export async function readClientSessionForPage(): Promise<ClientSessionData | null> {
  try {
    const session = await getCachedRequestSession();
    if (!session) {
      return null;
    }
    return toClientSessionData(session);
  } catch {
    return null;
  }
}
