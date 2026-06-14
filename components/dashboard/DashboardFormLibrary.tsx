"use client";

import { useLocaleRouter as useRouter } from "@/lib/i18n/client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { deferEffect } from "@/lib/defer-effect";

import { FormLibraryRow } from "@/components/dashboard/FormLibraryRow";
import {
  EntityList,
  EntityListColumns,
  EntityListFooter,
  EntityListPanel,
  EntityListPager,
  EntityListSearch,
  EntityListToolbar,
} from "@/components/lists/EntityList";
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
  const [startingFormId, setStartingFormId] = useState<string | null>(null);
  const [creatingForm, setCreatingForm] = useState(false);
  const [importingExam, setImportingExam] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [deletingFormId, setDeletingFormId] = useState<string | null>(null);
  const [formLibraryPage, setFormLibraryPage] = useState(0);
  const [formLibrarySearch, setFormLibrarySearch] = useState("");
  const [saveTemplateFormId, setSaveTemplateFormId] = useState<string | null>(null);
  const [saveTemplateTitle, setSaveTemplateTitle] = useState("");
  const [deleteArmedFormId, setDeleteArmedFormId] = useState<string | null>(null);

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

  const deleteForm = useCallback(async (formId: string) => {
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
  }, [onError, t]);

  const startSessionForForm = async (formId: string) => {
    const minutes = sessionDurations[formId] ?? 45;
    const noTimeLimit = noTimeLimitByForm[formId] === true;
    setStartingFormId(formId);
    try {
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
      const text = await file.text();
      let document: unknown;
      try {
        document = JSON.parse(text);
      } catch {
        throw new Error(t("formLibrary.import.errors.invalidJson"));
      }
      const data = await requestJson<{ form: Form }>("/api/forms/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document }),
      });
      const created = {
        ...data.form,
        questionCount: data.form.questions.length,
      };
      setForms((prev) => [...prev, created]);
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
    (form: Form): OverflowMenuItem[] => {
      const acceptLateSync = acceptLateSyncByForm[form.id] !== false;
      return [
        {
          type: "custom",
          key: `late-sync-${form.id}`,
          node: (
            <label className="tp-overflow-menu__toggle">
              <input
                type="checkbox"
                checked={acceptLateSync}
                onChange={(event) =>
                  setAcceptLateSyncByForm((current) => ({
                    ...current,
                    [form.id]: event.target.checked,
                  }))
                }
              />
              <span>{t("formLibrary.acceptLateSyncShort")}</span>
            </label>
          ),
        },
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
        {
          type: "button",
          label:
            deleteArmedFormId === form.id ? t("common.tapAgain") : t("common.delete"),
          tone: "danger",
          disabled: startingFormId === form.id || deletingFormId === form.id,
          keepOpen: deleteArmedFormId !== form.id,
          onClick: () => {
            if (deleteArmedFormId === form.id) {
              setDeleteArmedFormId(null);
              void deleteForm(form.id);
              return;
            }
            setDeleteArmedFormId(form.id);
            window.setTimeout(() => {
              setDeleteArmedFormId((current) => (current === form.id ? null : current));
            }, 4000);
          },
        },
      ];
    },
    [
      acceptLateSyncByForm,
      deleteArmedFormId,
      deleteForm,
      deletingFormId,
      locale,
      origin,
      sessionOptionsForForm,
      startingFormId,
      t,
    ],
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
            <a
              href="/api/forms/ai-template"
              download
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
                <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
              </svg>
              {t("formLibrary.import.downloadGuide")}
            </a>
          </HelpHint>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) {
                void importExamFromFile(file);
              }
            }}
          />
          <button
            type="button"
            data-tour="import-exam"
            disabled={importingExam || creatingForm}
            onClick={() => importInputRef.current?.click()}
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
            <HelpHint
              id="dash-session-settings"
              text={t("help.dashboard.sessionSettings")}
              label={t("formLibrary.listHeaderSetup")}
            />
            <HelpHint
              id="dash-accept-late-sync"
              text={t("help.dashboard.acceptLateSync")}
              label={t("formLibrary.acceptLateSyncShort")}
            />
          </EntityListToolbar>
          {filteredForms.length === 0 ? (
            <p className="tp-entity-list-empty">
              {t("formLibrary.noMatches", { query: formLibrarySearch.trim() })}
            </p>
          ) : (
            <>
              <EntityListColumns
                variant="three"
                columns={[
                  t("formLibrary.listHeaderForm"),
                  t("formLibrary.listHeaderSetup"),
                  t("formLibrary.listHeaderActions"),
                ]}
              />
              <EntityList>
                {formLibraryPageSlice.map((form) => (
                  <FormLibraryRow
                    key={form.id}
                    form={form}
                    questionCount={questionCount(form)}
                    durationMinutes={sessionDurations[form.id] ?? 45}
                    noTimeLimit={noTimeLimitByForm[form.id] === true}
                    deliveryMode={deliveryModeByForm[form.id] ?? "live"}
                    starting={startingFormId === form.id}
                    menuItems={formRowMenuItems(form)}
                    onDurationChange={(minutes) =>
                      setSessionDurations((d) => ({ ...d, [form.id]: minutes }))
                    }
                    onNoTimeLimitChange={(enabled) =>
                      setNoTimeLimitByForm((current) => ({ ...current, [form.id]: enabled }))
                    }
                    onDeliveryModeChange={(mode) =>
                      setDeliveryModeByForm((current) => ({ ...current, [form.id]: mode }))
                    }
                    onStart={() => void startSessionForForm(form.id)}
                  />
                ))}
              </EntityList>
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
    </section>
  );
}
