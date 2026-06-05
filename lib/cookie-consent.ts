export const COOKIE_CONSENT_STORAGE_KEY = "tp_cookie_consent_v1";

export type CookieCategory = "essential" | "analytics" | "marketing";

export type CookieConsentChoice = {
  version: 1;
  essential: true;
  analytics: boolean;
  marketing: boolean;
  updatedAt: string;
};

export const DEFAULT_COOKIE_CONSENT: CookieConsentChoice = {
  version: 1,
  essential: true,
  analytics: false,
  marketing: false,
  updatedAt: "",
};

export function parseCookieConsent(raw: string | null): CookieConsentChoice | null {
  if (!raw) {
    return null;
  }
  try {
    const data = JSON.parse(raw) as Partial<CookieConsentChoice>;
    if (data.version !== 1 || data.essential !== true) {
      return null;
    }
    return {
      version: 1,
      essential: true,
      analytics: Boolean(data.analytics),
      marketing: Boolean(data.marketing),
      updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : "",
    };
  } catch {
    return null;
  }
}

export function readCookieConsent(): CookieConsentChoice | null {
  if (typeof window === "undefined") {
    return null;
  }
  return parseCookieConsent(window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY));
}

export function writeCookieConsent(
  choice: Pick<CookieConsentChoice, "analytics" | "marketing">,
) {
  const payload: CookieConsentChoice = {
    version: 1,
    essential: true,
    analytics: choice.analytics,
    marketing: choice.marketing,
    updatedAt: new Date().toISOString(),
  };
  window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, JSON.stringify(payload));
  window.dispatchEvent(new CustomEvent("tp-cookie-consent-change", { detail: payload }));
  return payload;
}

export function acceptAllCookies(): CookieConsentChoice {
  return writeCookieConsent({ analytics: true, marketing: true });
}

export function rejectNonEssentialCookies(): CookieConsentChoice {
  return writeCookieConsent({ analytics: false, marketing: false });
}
