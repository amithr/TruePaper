"use client";

import { useLocaleRouter as useRouter } from "@/lib/i18n/client";
import { useCallback, useEffect, useMemo, useState } from "react";

import { deferEffect } from "@/lib/defer-effect";

import { AiGuideModal } from "@/components/dashboard/AiGuideModal";
import { FormLibraryRow } from "@/components/dashboard/FormLibraryRow";
import { ImportExamModal } from "@/components/dashboard/ImportExamModal";
import {
  EntityList,
  EntityListFooter,
  EntityListPanel,
  EntityListPager,
  EntityListSearch,
  EntityListToolbar,
} from "@/components/lists/EntityList";
import { ConfirmButton } from "@/components/ConfirmButton";
import { HelpHint } from "@/components/HelpHint";
import { LoadingBar } from "@/components/LoadingBar";
import type { OverflowMenuItem } from "@/components/OverflowMenu";
import { SaveTemplateModal } from "@/components/library/SaveTemplateModal";
import type { Form } from "@/lib/forms";
import { copyToClipboard } from "@/lib/copy-to-clipboard";
import { buildFormStartUrl } from "@/lib/form-start-link";
import { useLocale, useTranslations } from "@/lib/i18n/I18nProvider";
import { stashPendingBuilderForm } from "@/lib/pending-builder-form";
import { ui } from "@/lib/ui";
import { requestJson } from "@/lib/request-json";
import { startLiveSession } from "@/lib/start-live-session";
import { toast } from "sonner";

const FORM_LIBRARY_PAGE_SIZE = 5;

type Props = {
  onError: (message: string) => void;
};

type OpenPopover = { formId: string; kind: "start" | "menu" } | null;

function seedSessionState(forms: Form[]) {
  const durations: Record<string, number> = {};
  const noTimeLimit: Record<string, boolean> = {};
  const deliveryMode: Record<string, "live" | "self_paced" | "hybrid"> = {};
  const acceptLateSync: Record<string, boolean> = {};
  for (const form of forms) {
    const defaults = form.lastSessionDefaults;
    if (!defaults) {
      continue;
    }
    durations[form.id] = defaults.durationMinutes;
    noTimeLimit[form.id] = defaults.noTimeLimit;
    deliveryMode[form.id] = defaults.deliveryMode;
    acceptLateSync[form.id] = defaults.acceptLateSync;
  }
  return { durations, noTimeLimit, deliveryMode, acceptLateSync };
}

export function DashboardFormLibrary({ onError }: Props) {
  const router = useRouter();
  const t = useTranslations();
  const locale = useLocale();
  const [origin] = useState(() => (typeof window !== "undefined" ? window.location.origin : ""));
  const [forms, setForms] = useState<Form[]>([]);
  const [loading, setLoading] = useState(true);
  const [sessionDurations, setSessionDurations] = useState<Record<string, number>>({});
  const [noTimeLimitByForm, setNoTimeLimitByForm] = useState<Record<string, boolean>>({});
  const [deliveryModeByForm, setDeliveryModeByForm] = useState<
    Record<string, "live" | "self_paced" | "hybrid">
  >({});
  const [acceptLateSyncByForm, setAcceptLateSyncByForm] = useState<Record<string, boolean>>({});
  const [liveFeedbackByForm, setLiveFeedbackByForm] = useState<Record<string, boolean>>({});
  const [openPopover, setOpenPopover] = useState<OpenPopover>(null);
  const [startingFormId, setStartingFormId] = useState<string | null>(null);
  const [creatingForm, setCreatingForm] = useState(false);
  const [importingExam, setImportingExam] = useState(false);
  const [aiGuideOpen, setAiGuideOpen] = useState(false);
  const [importExamOpen, setImportExamOpen] = useState(false);
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
          const seeded = seedSessionState(data.forms);
          setSessionDurations(seeded.durations);
          setNoTimeLimitByForm(seeded.noTimeLimit);
          setDeliveryModeByForm(seeded.deliveryMode);
          setAcceptLateSyncByForm(seeded.acceptLateSync);
          const feedback: Record<string, boolean> = {};
          for (const form of data.forms) {
            feedback[form.id] = form.liveTeacherFeedbackEnabled === true;
          }
          setLiveFeedbackByForm(feedback);
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

  const deleteForm = useCallback(async (formId: string) => {
    setDeletingFormId(formId);
    try {
      await requestJson<{ ok: true }>(`/api/forms/${formId}`, { method: "DELETE" });
      setForms((prev) => prev.filter((f) => f.id !== formId));
      setOpenPopover(null);
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
  }, [onError, t]);

  const startSessionForForm = async (formId: string) => {
    const minutes = sessionDurations[formId] ?? 45;
    const noTimeLimit = noTimeLimitByForm[formId] === true;
    setStartingFormId(formId);
    try {
      const form = forms.find((f) => f.id === formId);
      const liveFeedback = liveFeedbackByForm[formId] === true;
      if (form && form.liveTeacherFeedbackEnabled !== liveFeedback) {
        await requestJson<{ ok: true }>(`/api/forms/${formId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ liveTeacherFeedbackEnabled: liveFeedback }),
        });
        setForms((prev) =>
          prev.map((f) =>
            f.id === formId ? { ...f, liveTeacherFeedbackEnabled: liveFeedback } : f,
          ),
        );
      }
      const created = await startLiveSession(formId, {
        ...(noTimeLimit ? { noTimeLimit: true } : { durationMinutes: minutes }),
        deliveryMode: deliveryModeByForm[formId] ?? "live",
        acceptLateSync: acceptLateSyncByForm[formId] !== false,
      });
      router.push(`/dashboard/sessions/${created.liveSessionId}`);
    } catch (e) {
      onError(e instanceof Error ? e.message : t("formLibrary.errors.start"));
    } finally {
      setStartingFormId(null);
    }
  };

  const importExamFromFile = async (file: File) => {
    setImportingExam(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const data = await requestJson<{ form: Form }>("/api/forms/import", {
        method: "POST",
        body,
      });
      const created = {
        ...data.form,
        questionCount: data.form.questions.length,
        autogradeCount: 0,
        lastRunAt: null,
        lastSessionDefaults: null,
      };
      setForms((prev) => [...prev, created]);
      setImportExamOpen(false);
      stashPendingBuilderForm(created);
      router.push(`/?form=${encodeURIComponent(data.form.id)}`);
    } catch (e) {
      onError(e instanceof Error ? e.message : t("formLibrary.import.errors.failed"));
    } finally {
      setImportingExam(false);
    }
  };

  const questionCount = useCallback(
    (form: Form) => form.questionCount ?? form.questions.length,
    [],
  );

  const sessionOptionsForForm = useCallback(
    (formId: string) => ({
      durationMinutes: sessionDurations[formId] ?? 45,
      noTimeLimit: noTimeLimitByForm[formId] === true,
      deliveryMode: deliveryModeByForm[formId] ?? ("live" as const),
      acceptLateSync: acceptLateSyncByForm[formId] !== false,
    }),
    [sessionDurations, noTimeLimitByForm, deliveryModeByForm, acceptLateSyncByForm],
  );

  const formRowMenuItems = useCallback(
    (form: Form): OverflowMenuItem[] => [
      {
        type: "button",
        label: t("formLibrary.startLink.copy"),
        onClick: () => {
          const url = buildFormStartUrl(origin, locale, form.id, sessionOptionsForForm(form.id));
          if (url) {
            void copyToClipboard(url).then((ok) => {
              if (ok) {
                toast.success(t("formLibrary.startLink.copied"));
              }
            });
          }
        },
        disabled: !origin,
      },
      {
        type: "button",
        label: t("templateLibrary.save.action"),
        onClick: () => {
          setSaveTemplateFormId(form.id);
          setSaveTemplateTitle(form.title || "");
        },
      },
      { type: "divider", key: `divider-${form.id}` },
      {
        type: "custom",
        key: `delete-${form.id}`,
        node: (
          <ConfirmButton
            tone="danger"
            label={t("formLibrary.deleteEllipsis")}
            confirmLabel={t("common.tapAgainDelete")}
            busy={deletingFormId === form.id}
            busyLabel={t("common.deleting")}
            disabled={
              startingFormId === form.id ||
              (deletingFormId !== null && deletingFormId !== form.id)
            }
            onConfirm={() => void deleteForm(form.id)}
            className="tp-overflow-menu__confirm"
          />
        ),
      },
    ],
    [deleteForm, deletingFormId, locale, origin, sessionOptionsForForm, startingFormId, t],
  );

  return (
    <section className="tp-entity-list-section tp-card p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className={ui.sectionTitle}>{t("dashboard.forms")}</p>
          <h2 className="text-xl font-semibold tracking-tight">{t("dashboard.formLibraryTitle")}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <HelpHint id="dash-ai-guide" text={t("help.dashboard.aiGuide")}>
            <button
              type="button"
              onClick={() => setAiGuideOpen(true)}
              className={`${ui.btnGhost} inline-flex items-center gap-2 text-sm`}
            >
              <svg
                aria-hidden
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v.01M11 12h1v4h1" />
              </svg>
              {t("formLibrary.import.downloadGuide")}
            </button>
          </HelpHint>
          <button
            type="button"
            data-tour="import-exam"
            disabled={importingExam || creatingForm}
            onClick={() => setImportExamOpen(true)}
            className={`${ui.btnSecondary} inline-flex items-center gap-2 disabled:opacity-50`}
            aria-busy={importingExam}
          >
            {importingExam ? (
              <span
                className="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent opacity-80"
                aria-hidden
              />
            ) : (
              <svg
                aria-hidden
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 16V4M7 9l5-5 5 5M5 20h14" />
              </svg>
            )}
            {importingExam ? t("formLibrary.import.importing") : t("formLibrary.import.importExam")}
          </button>
          <HelpHint id="dash-import" text={t("help.dashboard.importExam")} />
          <button
            type="button"
            data-tour="new-form"
            disabled={creatingForm}
            onClick={async () => {
              setCreatingForm(true);
              try {
                const data = await requestJson<{ form: Form }>("/api/forms", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({}),
                });
                const created = {
                  ...data.form,
                  questionCount: 0,
                  questions: [],
                  autogradeCount: 0,
                  lastRunAt: null,
                  lastSessionDefaults: null,
                };
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
      </div>
      {loading ? (
        <LoadingBar className="max-w-md" label={t("loading.formLibrary")} />
      ) : null}
      {!loading && forms.length === 0 ? (
        <p className="tp-empty">{t("formLibrary.empty")}</p>
      ) : null}
      {!loading && forms.length > 0 ? (
        <EntityListPanel>
          <EntityListToolbar>
            <EntityListSearch
              value={formLibrarySearch}
              onChange={setFormLibrarySearch}
              placeholder={t("formLibrary.searchPlaceholder")}
              label={t("formLibrary.searchSrOnly")}
            />
          </EntityListToolbar>
          {filteredForms.length === 0 ? (
            <p className="tp-entity-list-empty">
              {t("formLibrary.noMatches", { query: formLibrarySearch.trim() })}
            </p>
          ) : (
            <>
              <EntityList>
                {formLibraryPageSlice.map((form) => (
                  <FormLibraryRow
                    key={form.id}
                    form={form}
                    questionCount={questionCount(form)}
                    autogradeCount={form.autogradeCount ?? 0}
                    lastRunAt={form.lastRunAt ?? null}
                    durationMinutes={sessionDurations[form.id] ?? 45}
                    noTimeLimit={noTimeLimitByForm[form.id] === true}
                    deliveryMode={deliveryModeByForm[form.id] ?? "live"}
                    acceptLateSync={acceptLateSyncByForm[form.id] !== false}
                    liveTeacherFeedbackEnabled={liveFeedbackByForm[form.id] === true}
                    starting={startingFormId === form.id}
                    menuItems={formRowMenuItems(form)}
                    openPopover={
                      openPopover?.formId === form.id ? openPopover.kind : null
                    }
                    onOpenPopoverChange={(kind) =>
                      setOpenPopover(kind ? { formId: form.id, kind } : null)
                    }
                    onDurationChange={(minutes) =>
                      setSessionDurations((d) => ({ ...d, [form.id]: minutes }))
                    }
                    onNoTimeLimitChange={(enabled) =>
                      setNoTimeLimitByForm((current) => ({ ...current, [form.id]: enabled }))
                    }
                    onDeliveryModeChange={(mode) =>
                      setDeliveryModeByForm((current) => ({ ...current, [form.id]: mode }))
                    }
                    onAcceptLateSyncChange={(enabled) =>
                      setAcceptLateSyncByForm((current) => ({ ...current, [form.id]: enabled }))
                    }
                    onLiveTeacherFeedbackChange={(enabled) =>
                      setLiveFeedbackByForm((current) => ({ ...current, [form.id]: enabled }))
                    }
                    onStart={() => void startSessionForForm(form.id)}
                    onEdit={() => router.push(`/?form=${encodeURIComponent(form.id)}`)}
                  />
                ))}
              </EntityList>
              <p className="tp-form-library-row-hint">{t("formLibrary.rowHint")}</p>
              {filteredForms.length > FORM_LIBRARY_PAGE_SIZE ? (
                <EntityListFooter>
                  <p>
                    {t("formLibrary.page", {
                      current: formLibraryPage + 1,
                      total: formLibraryTotalPages,
                      count: filteredForms.length,
                    })}
                  </p>
                  <EntityListPager>
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
                  </EntityListPager>
                </EntityListFooter>
              ) : null}
            </>
          )}
        </EntityListPanel>
      ) : null}
      <SaveTemplateModal
        open={saveTemplateFormId !== null}
        onClose={() => setSaveTemplateFormId(null)}
        sourceKind="form"
        formId={saveTemplateFormId ?? undefined}
        defaultTitle={saveTemplateTitle}
      />
      <AiGuideModal
        open={aiGuideOpen}
        onClose={() => setAiGuideOpen(false)}
        onImportExam={() => setImportExamOpen(true)}
      />
      {importExamOpen ? (
        <ImportExamModal
          open
          importing={importingExam}
          onClose={() => {
            if (!importingExam) {
              setImportExamOpen(false);
            }
          }}
          onImport={(file) => void importExamFromFile(file)}
        />
      ) : null}
    </section>
  );
}
