/**
 * Device-local preference for teacher onboarding hints (the subtle ⓘ tooltips).
 * Modeled on lib/cookie-consent.ts: versioned localStorage payload + a window
 * CustomEvent so open tabs/components react to changes immediately.
 *
 * Note: the first-login *tour* is account-scoped (profiles.onboarding_tour_completed_at),
 * NOT stored here. This module only governs whether ambient hint triggers render.
 */
export const HELP_PREFS_STORAGE_KEY = "tp_help_hints_v1";

export const HELP_PREFS_CHANGE_EVENT = "tp-help-prefs-change";

export type HelpPrefs = {
  version: 1;
  hintsEnabled: boolean;
  updatedAt: string;
};

export const DEFAULT_HELP_PREFS: HelpPrefs = {
  version: 1,
  hintsEnabled: true,
  updatedAt: "",
};

export function parseHelpPrefs(raw: string | null): HelpPrefs | null {
  if (!raw) {
    return null;
  }
  try {
    const data = JSON.parse(raw) as Partial<HelpPrefs>;
    if (data.version !== 1) {
      return null;
    }
    return {
      version: 1,
      hintsEnabled: typeof data.hintsEnabled === "boolean" ? data.hintsEnabled : true,
      updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : "",
    };
  } catch {
    return null;
  }
}

export function readHelpPrefs(): HelpPrefs {
  if (typeof window === "undefined") {
    return DEFAULT_HELP_PREFS;
  }
  return parseHelpPrefs(window.localStorage.getItem(HELP_PREFS_STORAGE_KEY)) ?? DEFAULT_HELP_PREFS;
}

export function writeHelpPrefs(partial: Partial<Omit<HelpPrefs, "version" | "updatedAt">>): HelpPrefs {
  const current = readHelpPrefs();
  const payload: HelpPrefs = {
    version: 1,
    hintsEnabled: partial.hintsEnabled ?? current.hintsEnabled,
    updatedAt: new Date().toISOString(),
  };
  if (typeof window !== "undefined") {
    window.localStorage.setItem(HELP_PREFS_STORAGE_KEY, JSON.stringify(payload));
    window.dispatchEvent(new CustomEvent(HELP_PREFS_CHANGE_EVENT, { detail: payload }));
  }
  return payload;
}

export function setHintsEnabled(enabled: boolean): HelpPrefs {
  return writeHelpPrefs({ hintsEnabled: enabled });
}
