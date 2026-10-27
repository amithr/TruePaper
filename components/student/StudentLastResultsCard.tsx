"use client";

import { StudentResultsCard } from "@/components/student/StudentResultsCard";
import { useStudentResultsToken } from "@/components/student/use-student-results-token";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import type { LastResults } from "@/lib/last-results";
import { ui } from "@/lib/ui";

/** "/join" with no code: the exam this device last handed in, one tap to its results. */
export function StudentLastResultsCard({ entry }: { entry: LastResults }) {
  const t = useTranslations();
  const token = useStudentResultsToken(entry);

  return (
    <section className="mb-6 tp-card p-5 sm:p-6" data-testid="student-last-results">
      <p className={ui.sectionTitle}>{t("home.results.lastExamTitle")}</p>
      <h2 className="mt-1 text-lg font-semibold tracking-tight text-[var(--tp-text)]">{entry.formTitle}</h2>
      <div className="mt-4">
        {token ? (
          <StudentResultsCard token={token} compact />
        ) : (
          <p className="text-sm text-[var(--tp-text-secondary)]">{t("home.results.waitingTitle")}</p>
        )}
      </div>
    </section>
  );
}
