"use client";

import { useEffect, useState } from "react";

import type { ClientSessionData } from "@/lib/client-session";
import { requestJson } from "@/lib/request-json";
import { documentHasSupabaseAuthCookie } from "@/lib/supabase/auth-cookie";

type SessionApiResponse = {
  user: ClientSessionData["user"] | null;
  profile: ClientSessionData["profile"] | null;
};

/**
 * Hydrates auth session on static home/join pages. Guests with no Supabase cookie
 * resolve immediately; signed-in users fetch `/api/auth/session` once on the client.
 */
export function useClientSessionHydration(initialSession: ClientSessionData | null) {
  const [session, setSession] = useState<ClientSessionData | null>(initialSession);
  const [sessionHydrated, setSessionHydrated] = useState(initialSession !== null);

  useEffect(() => {
    if (initialSession !== null) {
      setSession(initialSession);
      setSessionHydrated(true);
      return;
    }

    if (!documentHasSupabaseAuthCookie()) {
      setSessionHydrated(true);
      return;
    }

    let cancelled = false;
    void requestJson<SessionApiResponse>("/api/auth/session")
      .then((data) => {
        if (cancelled) {
          return;
        }
        if (data.user) {
          setSession({ user: data.user, profile: data.profile });
        }
        setSessionHydrated(true);
      })
      .catch(() => {
        if (!cancelled) {
          setSessionHydrated(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [initialSession]);

  return { session, setSession, sessionHydrated };
}
