"use client";

import { useState } from "react";

import { useTranslations } from "@/lib/i18n/I18nProvider";
import { useStudentFeedbackItems } from "@/lib/use-student-feedback-items";
import { focusRing } from "@/lib/ui";

type Props = {
  liveSessionId: string | null;
  deviceId: string | null;
  enabled: boolean;
  questionNumberById: Record<string, number>;
};

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return "";
  }
}

/**
 * Calm, count-based teacher feedback for the student: a quiet panel with a small
 * count indicator — no push interruption, no sound, no celebratory motion.
 * Feedback is shown in the teacher's authoring order (created_at), never sync time.
 */
export function StudentFeedbackNotes({
  liveSessionId,
  deviceId,
  enabled,
  questionNumberById,
}: Props) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const { items, hasUnseen, unseenCount, markSeen } = useStudentFeedbackItems({
    liveSessionId,
    deviceId,
    enabled,
  });

  if (!enabled || items.length === 0) {
    return null;
  }

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      if (next) {
        markSeen();
      }
      return next;
    });
  };

  return (
    <aside className="tp-fb-notes" aria-label={t("feedback.notes.title")}>
      <button
        type="button"
        className={`tp-fb-notes__summary ${focusRing}`}
        aria-expanded={open}
        onClick={toggle}
      >
        <span className="tp-fb-notes__dot" data-unseen={hasUnseen ? "true" : "false"} aria-hidden />
        <span className="tp-fb-notes__title">{t("feedback.notes.title")}</span>
        <span className="tp-fb-notes__count" aria-hidden>
          {items.length}
        </span>
        {hasUnseen ? (
          <span className="sr-only">{t("feedback.notes.newCount", { count: unseenCount })}</span>
        ) : null}
      </button>

      {open ? (
        <ul className="tp-fb-notes__list">
          {items.map((item) => {
            const number = item.questionId ? questionNumberById[item.questionId] : undefined;
            return (
              <li key={item.id} className="tp-fb-notes__item">
                <div className="tp-fb-notes__meta">
                  <span className="tp-fb-notes__author">{item.authorName}</span>
                  {number ? (
                    <span className="tp-fb-notes__q">
                      {t("feedback.notes.onQuestion", { number })}
                    </span>
                  ) : null}
                  <time dateTime={item.createdAt}>{formatTime(item.createdAt)}</time>
                </div>
                <p className="tp-fb-notes__body whitespace-pre-wrap">{item.body}</p>
                {item.versionChanged ? (
                  <p className="tp-fb-notes__stale">{t("feedback.notes.versionChanged")}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </aside>
  );
}
