"use client";

import { ExamMarkdown } from "@/components/ExamMarkdown";
import { FormAssetImage } from "@/components/FormAssetImage";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import { focusRing } from "@/lib/ui";

type Props = {
  title: string;
  description: string;
  descriptionImagePath?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function WatchFormBrief({
  title,
  description,
  descriptionImagePath,
  open,
  onOpenChange,
}: Props) {
  const t = useTranslations();
  const hasBody = Boolean(description.trim() || descriptionImagePath);

  return (
    <div className="tp-watch-brief">
      <div className="tp-watch-brief__row">
        <p className="tp-watch-brief__title">{title || t("common.untitledForm")}</p>
        {hasBody ? (
          <button
            type="button"
            className={`tp-watch-brief__toggle ${focusRing}`}
            onClick={() => onOpenChange(!open)}
            aria-expanded={open}
          >
            {open ? t("session.watch.hideBrief") : t("session.watch.showBrief")}
          </button>
        ) : null}
      </div>
      {open && hasBody ? (
        <div className="tp-watch-brief__body">
          {description.trim() ? (
            <ExamMarkdown variant="body">{description}</ExamMarkdown>
          ) : null}
          {descriptionImagePath ? (
            <FormAssetImage
              path={descriptionImagePath}
              alt={t("home.exam.descriptionImageAlt")}
              className="mt-3 overflow-hidden rounded-[10px] border border-[var(--tp-border)] bg-white"
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
