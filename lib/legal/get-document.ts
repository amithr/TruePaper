import type { Locale } from "@/lib/i18n/config";
import {
  cookiePolicyEn,
  privacyPolicyEn,
  termsOfServiceEn,
} from "@/lib/legal/content/en";
import {
  cookiePolicyUk,
  privacyPolicyUk,
  termsOfServiceUk,
} from "@/lib/legal/content/uk";
import type { LegalDocumentContent, LegalSlug } from "@/lib/legal/types";

const byLocale: Record<Locale, Record<LegalSlug, LegalDocumentContent>> = {
  en: {
    privacy: privacyPolicyEn,
    terms: termsOfServiceEn,
    cookies: cookiePolicyEn,
  },
  uk: {
    privacy: privacyPolicyUk,
    terms: termsOfServiceUk,
    cookies: cookiePolicyUk,
  },
};

export function getLegalDocument(locale: Locale, slug: LegalSlug): LegalDocumentContent {
  return byLocale[locale][slug];
}
