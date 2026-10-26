"use client";

import { MessageSquareText } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useTranslations } from "@/lib/i18n/I18nProvider";
import { requestJson } from "@/lib/request-json";
import { ui } from "@/lib/ui";

type Props = {
  formId: string;
  enabled: boolean;
  /** Called after the form was saved; the page mirrors the flag into its own state. */
  onChanged: (enabled: boolean) => void;
  /** "menu": a checkbox row for an overflow menu. "banner": a call-out with a Turn on button. */
  variant: "menu" | "banner";
};

/**
 * Live teacher feedback is a per-form setting (`forms.live_teacher_feedback_enabled`),
 * normally chosen in the Start popover. This lets a teacher flip it during a session
 * from the session or watch page; students pick it up within a poll.
 */
export function LiveFeedbackToggle({ formId, enabled, onChanged, variant }: Props) {
  const t = useTranslations();
  const [busy, setBusy] = useState(false);

  const setEnabled = async (next: boolean) => {
    setBusy(true);
    try {
      await requestJson<{ ok: true }>(`/api/forms/${formId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ liveTeacherFeedbackEnabled: next }),
      });
      onChanged(next);
      toast.success(next ? t("session.liveFeedback.enabledToast") : t("session.liveFeedback.disabledToast"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("session.liveFeedback.failed"));
    } finally {
      setBusy(false);
    }
  };

  if (variant === "banner") {
    if (enabled) {
      return null;
    }
    return (
      <div className="tp-live-feedback-banner" role="status" data-testid="live-feedback-banner">
        <MessageSquareText aria-hidden className="h-5 w-5 shrink-0 text-[var(--tp-accent)]" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{t("session.liveFeedback.bannerTitle")}</p>
          <p className="mt-0.5 text-[0.8125rem] leading-snug text-[var(--tp-text-secondary)]">
            {t("session.liveFeedback.bannerBody")}
          </p>
        </div>
        <button
          type="button"
          className={ui.btnPrimary}
          disabled={busy}
          onClick={() => void setEnabled(true)}
          data-testid="live-feedback-turn-on"
        >
          {busy ? t("session.liveFeedback.turningOn") : t("session.liveFeedback.turnOn")}
        </button>
      </div>
    );
  }

  return (
    <label className="tp-overflow-menu__toggle" data-testid="live-feedback-menu-toggle">
      <input
        type="checkbox"
        checked={enabled}
        disabled={busy}
        onChange={(event) => void setEnabled(event.target.checked)}
      />
      <span>
        {t("session.liveFeedback.menuLabel")}
        <span className="ml-1 text-xs text-[var(--tp-text-muted)]">
          {enabled ? t("session.liveFeedback.on") : t("session.liveFeedback.off")}
        </span>
      </span>
    </label>
  );
}
