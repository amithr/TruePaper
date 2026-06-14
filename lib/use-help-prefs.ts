"use client";

import { useCallback, useEffect, useState } from "react";

import { deferEffect } from "@/lib/defer-effect";
import {
  HELP_PREFS_CHANGE_EVENT,
  HELP_PREFS_STORAGE_KEY,
  readHelpPrefs,
  setHintsEnabled as persistHintsEnabled,
} from "@/lib/help-prefs";

type UseHelpPrefs = {
  /** Undefined until read on the client (avoids SSR hydration mismatch). */
  ready: boolean;
  hintsEnabled: boolean;
  setHintsEnabled: (enabled: boolean) => void;
  toggleHints: () => void;
};

/**
 * Subscribes to help-pref changes (same-tab CustomEvent + cross-tab storage event).
 * Reads in an effect so server render and first client render agree, then updates.
 */
export function useHelpPrefs(): UseHelpPrefs {
  const [hintsEnabled, setHintsEnabledState] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => {
      setHintsEnabledState(readHelpPrefs().hintsEnabled);
      setReady(true);
    };
    deferEffect(() => sync());

    const onCustom = () => sync();
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === HELP_PREFS_STORAGE_KEY) {
        sync();
      }
    };
    window.addEventListener(HELP_PREFS_CHANGE_EVENT, onCustom);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(HELP_PREFS_CHANGE_EVENT, onCustom);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const setHintsEnabled = useCallback((enabled: boolean) => {
    persistHintsEnabled(enabled);
    setHintsEnabledState(enabled);
  }, []);

  const toggleHints = useCallback(() => {
    setHintsEnabledState((prev) => {
      const next = !prev;
      persistHintsEnabled(next);
      return next;
    });
  }, []);

  return { ready, hintsEnabled, setHintsEnabled, toggleHints };
}
