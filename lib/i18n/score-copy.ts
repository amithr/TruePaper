"use client";

import type { ScoreTier } from "@/lib/exam-grades";
import { useTranslations } from "@/lib/i18n/I18nProvider";

/** Localized score display and tier messages for client UI. */
export function useScoreCopy() {
  const t = useTranslations();

  return {
    formatPointsScore(earned: number, possible: number): string {
      const unit = possible === 1 ? t("grades.point") : t("grades.points");
      return t("grades.formatPoints", { earned, possible, unit });
    },
    scoreTierMessage(tier: ScoreTier): string {
      switch (tier) {
        case "perfect":
          return t("grades.tier.perfect");
        case "great":
          return t("grades.tier.great");
        case "solid":
          return t("grades.tier.solid");
        default:
          return t("grades.tier.needsWork");
      }
    },
  };
}
