"use client";

import { useState } from "react";

import { useTranslations } from "@/lib/i18n/I18nProvider";
import type { TeacherFeedbackDisplayItem, TeacherFeedbackDisplayStatus } from "@/lib/feedback-items";
import { focusRing, ui } from "@/lib/ui";

type Props = {
  items: TeacherFeedbackDisplayItem[];
  onSend: (body: string) => void | Promise<void>;
  onEdit: (id: string, body: string) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
  onRetry: (id: string) => void | Promise<void>;
};

const STATUS_TONE: Record<TeacherFeedbackDisplayStatus, string> = {
  queued: "tp-fb-status--queued",
  uploading: "tp-fb-status--uploading",
  failed: "tp-fb-status--failed",
  synced: "tp-fb-status--synced",
  delivered: "tp-fb-status--delivered",
};

function formatTime(ms: number): string {
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return "";
  }
}

export function TeacherFeedbackComposer({ items, onSend, onEdit, onDelete, onRetry }: Props) {
  const t = useTranslations();
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const statusLabel = (status: TeacherFeedbackDisplayStatus): string =>
    t(`feedback.composer.status.${status}`);

  const submit = () => {
    const body = draft.trim();
    if (!body) {
      return;
    }
    void onSend(body);
    setDraft("");
  };

  const startEdit = (item: TeacherFeedbackDisplayItem) => {
    setEditingId(item.id);
    setEditDraft(item.body);
  };

  const commitEdit = () => {
    if (editingId) {
      const body = editDraft.trim();
      if (body) {
        void onEdit(editingId, body);
      }
    }
    setEditingId(null);
    setEditDraft("");
  };

  return (
    <section className="tp-fb-composer" aria-label={t("feedback.composer.title")}>
      <p className={ui.sectionTitle}>{t("feedback.composer.title")}</p>

      {items.length > 0 ? (
        <ul className="tp-fb-list">
          {items.map((item) => (
            <li key={item.id} className="tp-fb-item" data-status={item.status}>
              {editingId === item.id ? (
                <div className="tp-fb-edit">
                  <textarea
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    className={ui.textarea}
                    rows={2}
                    aria-label={t("feedback.composer.editLabel")}
                  />
                  <div className="tp-fb-actions">
                    <button type="button" className={`${ui.btnSecondary} px-3 py-1 text-sm`} onClick={commitEdit}>
                      {t("common.save")}
                    </button>
                    <button
                      type="button"
                      className={`tp-link text-sm ${focusRing}`}
                      onClick={() => {
                        setEditingId(null);
                        setEditDraft("");
                      }}
                    >
                      {t("common.cancel")}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="tp-fb-item__head">
                    <span className="tp-fb-author">
                      {item.isOwn ? t("feedback.composer.you") : item.authorName}
                    </span>
                    <span className={`tp-fb-status ${STATUS_TONE[item.status]}`}>
                      {statusLabel(item.status)}
                    </span>
                  </div>
                  <p className="tp-fb-body whitespace-pre-wrap">{item.body}</p>
                  <div className="tp-fb-item__meta">
                    <time dateTime={new Date(item.createdAt).toISOString()}>
                      {formatTime(item.createdAt)}
                    </time>
                    {item.isOwn ? (
                      <span className="tp-fb-actions">
                        {item.status === "failed" ? (
                          <button
                            type="button"
                            className={`tp-link text-xs ${focusRing}`}
                            onClick={() => void onRetry(item.id)}
                          >
                            {t("feedback.composer.retry")}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className={`tp-link text-xs ${focusRing}`}
                          onClick={() => startEdit(item)}
                        >
                          {t("common.edit")}
                        </button>
                        <button
                          type="button"
                          className={`tp-link tp-link--danger text-xs ${focusRing}`}
                          onClick={() => void onDelete(item.id)}
                        >
                          {t("common.delete")}
                        </button>
                      </span>
                    ) : null}
                  </div>
                  {item.status === "failed" ? (
                    <p className="tp-fb-error" role="alert">
                      {t("feedback.composer.failedHint")}
                    </p>
                  ) : null}
                </>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="tp-fb-input-row">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={t("feedback.composer.placeholder")}
          className={ui.textarea}
          rows={2}
          aria-label={t("feedback.composer.title")}
        />
        <button
          type="button"
          className={`${ui.btnSecondary} px-3 py-1.5 text-sm`}
          disabled={!draft.trim()}
          onClick={submit}
        >
          {t("feedback.composer.add")}
        </button>
      </div>
    </section>
  );
}
