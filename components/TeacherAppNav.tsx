"use client";

import { useTranslations } from "@/lib/i18n/I18nProvider";
import { LocaleLink } from "@/lib/i18n/client";
import { ui } from "@/lib/ui";

export type TeacherNavActive = "dashboard" | "templates" | "join" | "none";

type Props = {
  active: TeacherNavActive;
};

export function TeacherAppNav({ active }: Props) {
  const t = useTranslations();
  return (
    <nav aria-label={t("nav.teacherNavLabel")} className="flex flex-wrap gap-2">
      <LocaleLink href="/dashboard" className={active === "dashboard" ? ui.pillActive : ui.pill}>
        {t("nav.formLibrary")}
      </LocaleLink>
      <LocaleLink href="/dashboard/templates" className={active === "templates" ? ui.pillActive : ui.pill}>
        {t("nav.templateLibrary")}
      </LocaleLink>
      <LocaleLink href="/join" className={active === "join" ? ui.pillActive : ui.pill}>
        {t("nav.studentJoin")}
      </LocaleLink>
    </nav>
  );
}
