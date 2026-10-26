"use client";

import { LoadingBar } from "@/components/LoadingBar";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import { ui } from "@/lib/ui";

type Props = {
  label: string;
  error?: string;
  /** The first load has been retrying for a while: say so and offer a button. */
  slow: boolean;
  onRetry: () => void;
};

/** Loading bar for a page's first load that never strands the teacher on it. */
export function PageLoadingState({ label, error, slow, onRetry }: Props) {
  const t = useTranslations();
  if (error) {
    return (
      <div className="mt-6 space-y-3" role="alert">
        <p className="tp-alert tp-alert-error">{error}</p>
        <button type="button" className={ui.btnSecondary} onClick={onRetry}>
          {t("common.tryAgain")}
        </button>
      </div>
    );
  }
  return (
    <div className="mt-6 max-w-md space-y-3" data-testid="page-loading">
      <LoadingBar label={label} />
      {slow ? (
        <div className="flex flex-wrap items-center gap-2" role="status">
          <p className="text-sm text-[var(--tp-text-secondary)]">{t("loading.slow")}</p>
          <button type="button" className={ui.btnSecondary} onClick={onRetry} data-testid="page-loading-retry">
            {t("common.tryAgain")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
