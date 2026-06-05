"use client";

import { LocaleLink as Link, useLocaleRouter as useRouter } from "@/lib/i18n/client";
import { useCallback, useEffect, useMemo, useState } from "react";

import { deferEffect } from "@/lib/defer-effect";

import { ConfirmButton } from "@/components/ConfirmButton";
import { SaveTemplateModal } from "@/components/library/SaveTemplateModal";
import { LoadingBar } from "@/components/LoadingBar";
import type { Form } from "@/lib/forms";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import { stashPendingBuilderForm } from "@/lib/pending-builder-form";
import { focusRing, ui } from "@/lib/ui";
import { requestJson } from "@/lib/request-json";

const FORM_LIBRARY_PAGE_SIZE = 5;

type Props = {
  onError: (message: string) => void;
};

export function DashboardFormLibrary({ onError }: Props) {
  const router = useRouter();
  const t = useTranslations();
  const [forms, setForms] = useState<Form[]>([]);
  const [loading, setLoading] = useState(true);
  const [sessionDurations, setSessionDurations] = useState<Record<string, number>>({});
  const [noTimeLimitByForm, setNoTimeLimitByForm] = useState<Record<string, boolean>>({});
  const [deliveryModeByForm, setDeliveryModeByForm] = useState<
    Record<string, "live" | "self_paced" | "hybrid">
  >({});
  const [startingFormId, setStartingFormId] = useState<string | null>(null);
  const [creatingForm, setCreatingForm] = useState(false);
  const [deletingFormId, setDeletingFormId] = useState<string | null>(null);
  const [formLibraryPage, setFormLibraryPage] = useState(0);
  const [formLibrarySearch, setFormLibrarySearch] = useState("");
  const [saveTemplateFormId, setSaveTemplateFormId] = useState<string | null>(null);
  const [saveTemplateTitle, setSaveTemplateTitle] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await requestJson<{ forms: Form[] }>("/api/forms?summary=1");
        if (!cancelled) {
          setForms(data.forms);
        }
      } catch (e) {
        if (!cancelled) {
          onError(e instanceof Error ? e.message : t("formLibrary.errors.load"));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [onError, t]);

  const filteredForms = useMemo(() => {
    const q = formLibrarySearch.trim().toLowerCase();
    if (!q) {
      return forms;
    }
    return forms.filter((f) => {
      const title = (f.title || "").toLowerCase();
      const desc = (f.description || "").toLowerCase();
      return title.includes(q) || desc.includes(q);
    });
  }, [forms, formLibrarySearch]);

  const formLibraryTotalPages = Math.max(1, Math.ceil(filteredForms.length / FORM_LIBRARY_PAGE_SIZE));

  useEffect(() => {
    const maxPage = Math.max(0, formLibraryTotalPages - 1);
    deferEffect(() => {
      setFormLibraryPage((p) => Math.min(p, maxPage));
    });
  }, [formLibraryTotalPages]);

  const formLibraryPageSlice = useMemo(() => {
    const start = formLibraryPage * FORM_LIBRARY_PAGE_SIZE;
    return filteredForms.slice(start, start + FORM_LIBRARY_PAGE_SIZE);
  }, [filteredForms, formLibraryPage]);

  const deleteForm = async (formId: string) => {
    setDeletingFormId(formId);
    try {
      await requestJson<{ ok: true }>(`/api/forms/${formId}`, { method: "DELETE" });
      setForms((prev) => prev.filter((f) => f.id !== formId));
      setSessionDurations((d) => {
        const next = { ...d };
        delete next[formId];
        return next;
      });
    } catch (e) {
      onError(e instanceof Error ? e.message : t("formLibrary.errors.delete"));
    } finally {
      setDeletingFormId(null);
    }
  };

  const startSessionForForm = async (formId: string) => {
    const minutes = sessionDurations[formId] ?? 45;
    const noTimeLimit = noTimeLimitByForm[formId] === true;
    setStartingFormId(formId);
    try {
      const created = await requestJson<{
        liveSessionId: string;
        joinCode: string;
        closesAt: string;
      }>(`/api/forms/${formId}/live-sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(noTimeLimit ? { noTimeLimit: true } : { durationMinutes: minutes }),
          deliveryMode: deliveryModeByForm[formId] ?? "live",
        }),
      });
      router.push(`/dashboard/sessions/${created.liveSessionId}`);
    } catch (e) {
      onError(e instanceof Error ? e.message : t("formLibrary.errors.start"));
    } finally {
      setStartingFormId(null);
    }
  };

  const questionCount = useCallback(
    (form: Form) => form.questionCount ?? form.questions.length,
    [],
  );

  return (
    <section className="tp-card p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className={ui.sectionTitle}>{t("dashboard.forms")}</p>
          <h2 className="text-xl font-semibold tracking-tight">{t("dashboard.formLibraryTitle")}</h2>
        </div>
        <button
          type="button"
          disabled={creatingForm}
          onClick={async () => {
            setCreatingForm(true);
            try {
              const data = await requestJson<{ form: Form }>("/api/forms", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
              });
              const created = { ...data.form, questionCount: 0, questions: [] };
              setForms((prev) => [...prev, created]);
              stashPendingBuilderForm(created);
              router.push(`/?form=${encodeURIComponent(data.form.id)}`);
            } catch (e) {
              onError(e instanceof Error ? e.message : t("formLibrary.errors.create"));
            } finally {
              setCreatingForm(false);
            }
          }}
          className={`${ui.btnPrimary} disabled:opacity-50`}
          aria-busy={creatingForm}
        >
          <svg
            aria-hidden
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          {creatingForm ? t("common.creating") : t("formLibrary.newForm")}
        </button>
      </div>
      {loading ? (
        <LoadingBar className="max-w-md" label={t("loading.formLibrary")} />
      ) : null}
      {!loading && forms.length > 0 ? (
        <label className="mb-4 block max-w-md">
          <span className="sr-only">{t("formLibrary.searchSrOnly")}</span>
          <div className="relative">
            <svg
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--tp-text-muted)]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              type="search"
              value={formLibrarySearch}
              onChange={(e) => setFormLibrarySearch(e.target.value)}
              placeholder={t("formLibrary.searchPlaceholder")}
              autoComplete="off"
              spellCheck={false}
              className="tp-input pl-9"
            />
          </div>
        </label>
      ) : null}
      {!loading && forms.length === 0 ? (
        <p className="tp-empty">{t("formLibrary.empty")}</p>
      ) : null}
      {!loading && forms.length > 0 && filteredForms.length === 0 ? (
        <p className="tp-empty">
          {t("formLibrary.noMatches", { query: formLibrarySearch.trim() })}
        </p>
      ) : null}
      {!loading && filteredForms.length > 0 ? (
        <div className="space-y-4">
          <ul className="space-y-4">
            {formLibraryPageSlice.map((form) => {
              const count = questionCount(form);
              return (
                <li
                  key={form.id}
                  className="tp-card tp-card-interactive flex flex-wrap items-end justify-between gap-4 p-4 sm:p-5 tp-anim-fade-up"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-[var(--tp-text)]">
                      {form.title || t("common.untitledForm")}
                    </p>
                    <p className="mt-1 text-sm text-[var(--tp-text-secondary)]">
                      {count === 1
                        ? t("formLibrary.questionCountOne", { n: count })
                        : t("formLibrary.questionCountOther", { n: count })}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-2 text-sm text-[var(--tp-text-secondary)]">
                      <span className="sr-only">{t("formLibrary.minutesSrOnly")}</span>
                      <input
                        type="number"
                        min={5}
                        max={480}
                        value={sessionDurations[form.id] ?? 45}
                        onChange={(e) =>
                          setSessionDurations((d) => ({
                            ...d,
                            [form.id]: Number(e.target.value) || 45,
                          }))
                        }
                        disabled={noTimeLimitByForm[form.id] === true}
                        aria-label={t("formLibrary.minutesAria")}
                        className="w-16 rounded-[var(--tp-radius-xs)] border border-[var(--tp-border-strong)] px-2 py-1 text-center font-mono"
                      />
                      <span className="text-xs text-[var(--tp-text-muted)]">{t("common.min")}</span>
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-[var(--tp-text-secondary)]">
                      <input
                        type="checkbox"
                        checked={noTimeLimitByForm[form.id] === true}
                        onChange={(e) =>
                          setNoTimeLimitByForm((current) => ({
                            ...current,
                            [form.id]: e.target.checked,
                          }))
                        }
                      />
                      {t("common.noLimit")}
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-[var(--tp-text-secondary)]">
                      <span className="sr-only">{t("formLibrary.deliveryMode")}</span>
                      <select
                        value={deliveryModeByForm[form.id] ?? "live"}
                        onChange={(e) =>
                          setDeliveryModeByForm((current) => ({
                            ...current,
                            [form.id]: e.target.value as "live" | "self_paced" | "hybrid",
                          }))
                        }
                        aria-label={t("formLibrary.deliveryMode")}
                        className="rounded-[var(--tp-radius-xs)] border border-[var(--tp-border-strong)] bg-transparent px-2 py-1"
                      >
                        <option value="live">{t("formLibrary.deliveryLive")}</option>
                        <option value="self_paced">{t("formLibrary.deliverySelfPaced")}</option>
                        <option value="hybrid">{t("formLibrary.deliveryHybrid")}</option>
                      </select>
                    </label>
                    <button
                      type="button"
                      disabled={startingFormId === form.id}
                      onClick={() => void startSessionForForm(form.id)}
                      className={`${ui.btnPrimary} disabled:opacity-50`}
                    >
                      <svg
                        aria-hidden
                        className="h-3.5 w-3.5"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path d="M8 5v14l11-7z" />
                      </svg>
                      {startingFormId === form.id ? t("common.starting") : t("common.start")}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSaveTemplateFormId(form.id);
                        setSaveTemplateTitle(form.title || "");
                      }}
                      className={`${ui.btnSecondary} ${focusRing}`}
                    >
                      {t("templateLibrary.save.action")}
                    </button>
                    <Link
                      href={`/?form=${form.id}`}
                      className={`${ui.btnSecondary} ${focusRing}`}
                    >
                      {t("common.edit")}
                    </Link>
                    <ConfirmButton
                      tone="danger"
                      label={t("common.delete")}
                      confirmLabel={t("common.tapAgain")}
                      busy={deletingFormId === form.id}
                      busyLabel={t("common.deleting")}
                      disabled={startingFormId === form.id}
                      onConfirm={() => deleteForm(form.id)}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
          {filteredForms.length > FORM_LIBRARY_PAGE_SIZE ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--tp-border)] pt-3 text-sm text-[var(--tp-text-secondary)]">
              <p>
                {t("formLibrary.page", {
                  current: formLibraryPage + 1,
                  total: formLibraryTotalPages,
                  count: filteredForms.length,
                })}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={formLibraryPage <= 0}
                  onClick={() => setFormLibraryPage((p) => Math.max(0, p - 1))}
                  className={`${ui.btnSecondary} px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-40`}
                >
                  {t("common.previous")}
                </button>
                <button
                  type="button"
                  disabled={formLibraryPage >= formLibraryTotalPages - 1}
                  onClick={() =>
                    setFormLibraryPage((p) => Math.min(formLibraryTotalPages - 1, p + 1))
                  }
                  className={`${ui.btnSecondary} px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-40`}
                >
                  {t("common.next")}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      <SaveTemplateModal
        open={saveTemplateFormId !== null}
        onClose={() => setSaveTemplateFormId(null)}
        sourceKind="form"
        formId={saveTemplateFormId ?? undefined}
        defaultTitle={saveTemplateTitle}
      />
    </section>
  );
}
