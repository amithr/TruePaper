"use client";

import { useEffect, useState } from "react";

import { type LastResults, saveLastResults } from "@/lib/last-results";
import { requestJson } from "@/lib/request-json";

/**
 * The results token for a remembered hand-in. Usually it arrived with the
 * finish response; when it didn't (offline hand-in, exam ended by the teacher,
 * database migrated later) it's claimed from the server and stored.
 */
export function useStudentResultsToken(entry: LastResults): string | null {
  const [token, setToken] = useState<string | null>(entry.token);

  useEffect(() => {
    if (entry.token) {
      return;
    }
    let cancelled = false;
    void requestJson<{ token: string }>(`/api/public/live-sessions/${entry.liveSessionId}/review-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: entry.deviceId }),
    })
      .then((data) => {
        if (cancelled || !data.token) {
          return;
        }
        saveLastResults({ ...entry, token: data.token });
        setToken(data.token);
      })
      .catch(() => {
        /* pre-migration or not handed in yet: the plain card stays */
      });
    return () => {
      cancelled = true;
    };
  }, [entry]);

  return token;
}
