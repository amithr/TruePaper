"use client";

import { useEffect, useState } from "react";

import { countAnsweredQuestions } from "@/lib/count-answered-questions";
import { loadLocalAnswers } from "@/lib/offline/answer-store";
import { loadCachedExamSession } from "@/lib/offline/session-cache";

export type LocalAnswerProgress = { answered: number; total: number };

/**
 * "{answered} of {total} answered" for the exam this browser was taking, read from
 * IndexedDB (answers + cached form). `null` until known, or when either record is
 * missing — the caller then shows copy without a count.
 */
export function useLocalAnswerProgress(
  liveSessionId: string,
  deviceId: string,
): LocalAnswerProgress | null {
  const key = `${liveSessionId}::${deviceId.toLowerCase()}`;
  const [state, setState] = useState<{ key: string; progress: LocalAnswerProgress | null }>({
    key,
    progress: null,
  });

  useEffect(() => {
    let cancelled = false;
    if (!liveSessionId || !deviceId) {
      return;
    }
    void (async () => {
      try {
        const [record, cached] = await Promise.all([
          loadLocalAnswers(liveSessionId, deviceId),
          loadCachedExamSession(liveSessionId, deviceId),
        ]);
        if (cancelled || !record || !cached) {
          return;
        }
        const ids = cached.form.questions.map((q) => q.id);
        setState({
          key,
          progress: { answered: countAnsweredQuestions(record.answers, ids), total: ids.length },
        });
      } catch {
        /* IndexedDB unavailable — copy without a count */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [liveSessionId, deviceId, key]);

  return state.key === key ? state.progress : null;
}
