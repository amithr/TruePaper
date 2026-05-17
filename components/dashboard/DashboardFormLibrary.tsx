"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { LoadingBar } from "@/components/LoadingBar";
import type { Form } from "@/lib/forms";
import { buttonLabel, focusRing, ui } from "@/lib/ui";
import { requestJson } from "@/lib/request-json";

const FORM_LIBRARY_PAGE_SIZE = 5;

type Props = {
  onError: (message: string) => void;
};

export function DashboardFormLibrary({ onError }: Props) {
  const router = useRouter();
  const [forms, setForms] = useState<Form[]>([]);
  const [loading, setLoading] = useState(true);
  const [sessionDurations, setSessionDurations] = useState<Record<string, number>>({});
  const [noTimeLimitByForm, setNoTimeLimitByForm] = useState<Record<string, boolean>>({});
  const [startingFormId, setStartingFormId] = useState<string | null>(null);
  const [deletingFormId, setDeletingFormId] = useState<string | null>(null);
  const [formLibraryPage, setFormLibraryPage] = useState(0);
  const [formLibrarySearch, setFormLibrarySearch] = useState("");

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
          onError(e instanceof Error ? e.message : "Failed to load forms.");
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
  }, [onError]);

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
    setFormLibraryPage((p) => Math.min(p, maxPage));
  }, [formLibraryTotalPages]);

  const formLibraryPageSlice = useMemo(() => {
    const start = formLibraryPage * FORM_LIBRARY_PAGE_SIZE;
    return filteredForms.slice(start, start + FORM_LIBRARY_PAGE_SIZE);
  }, [filteredForms, formLibraryPage]);

  const deleteForm = async (formId: string, title: string) => {
    const label = title.trim() || "Untitled form";
    if (
      !window.confirm(
        `Delete “${label}”? This cannot be undone. Questions, past live sessions tied to this form, and saved responses for those sessions will be removed.`,
      )
    ) {
      return;
    }
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
      onError(e instanceof Error ? e.message : "Could not delete form.");
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
        body: JSON.stringify(noTimeLimit ? { noTimeLimit: true } : { durationMinutes: minutes }),
      });
      router.push(`/dashboard/sessions/${created.liveSessionId}`);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not start session.");
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
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className={ui.sectionTitle}>Forms</p>
          <h2 className="text-xl font-semibold tracking-tight">Form library</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Edit questions and copy, or start a timed session without leaving the dashboard.
          </p>
        </div>
        <button
          type="button"
          onClick={async () => {
            try {
              const data = await requestJson<{ form: Form }>("/api/forms", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
              });
              setForms((prev) => [...prev, { ...data.form, questionCount: 0, questions: [] }]);
              router.push(`/?form=${data.form.id}`);
            } catch (e) {
              onError(e instanceof Error ? e.message : "Could not create form.");
            }
          }}
          className="tp-btn-primary"
        >
          {buttonLabel("New form")}
        </button>
      </div>
      {loading ? (
        <LoadingBar className="max-w-md" label="Loading form library" />
      ) : null}
      {!loading && forms.length > 0 ? (
        <label className="mb-4 block text-sm font-medium text-zinc-800">
          Search forms
          <input
            type="search"
            value={formLibrarySearch}
            onChange={(e) => setFormLibrarySearch(e.target.value)}
            placeholder="Filter by title or description…"
            autoComplete="off"
            spellCheck={false}
            className="mt-1.5 w-full max-w-md rounded-md border border-zinc-300 px-3 py-2 text-zinc-900 placeholder:text-zinc-400"
          />
        </label>
      ) : null}
      {!loading && forms.length === 0 ? (
        <p className="tp-empty">
          Create your first form to build questions, then start a live session for your class.
        </p>
      ) : null}
      {!loading && forms.length > 0 && filteredForms.length === 0 ? (
        <p className="tp-empty">
          No forms match “{formLibrarySearch.trim()}”. Try a different search.
        </p>
      ) : null}
      {!loading && filteredForms.length > 0 ? (
        <div className="space-y-4">
          <ul className="space-y-4">
            {formLibraryPageSlice.map((form) => (
              <li
                key={form.id}
                className="flex flex-wrap items-end justify-between gap-4 rounded-xl border border-zinc-100 bg-zinc-50/80 px-4 py-4"
              >
                <div>
                  <p className="font-semibold text-zinc-900">{form.title || "Untitled form"}</p>
                  <p className="mt-1 text-sm text-zinc-600">
                    {questionCount(form)} question{questionCount(form) === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2 text-sm text-zinc-600">
                    Minutes
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
                      className="w-20 rounded-md border border-zinc-300 px-2 py-1"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-sm text-zinc-700">
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
                    No time limit
                  </label>
                  <button
                    type="button"
                    disabled={startingFormId === form.id}
                    onClick={() => void startSessionForForm(form.id)}
                    className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {startingFormId === form.id
                      ? buttonLabel("Starting…")
                      : buttonLabel("Start session")}
                  </button>
                  <Link
                    href={`/?form=${form.id}`}
                    className={`tp-btn-secondary ${focusRing}`}
                  >
                    {buttonLabel("Edit in builder")}
                  </Link>
                  <button
                    type="button"
                    disabled={deletingFormId === form.id || startingFormId === form.id}
                    onClick={() => void deleteForm(form.id, form.title)}
                    className={`${ui.btnDanger} disabled:opacity-50 ${focusRing}`}
                  >
                    {deletingFormId === form.id ? buttonLabel("Deleting…") : buttonLabel("Delete")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {filteredForms.length > FORM_LIBRARY_PAGE_SIZE ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 pt-3 text-sm text-zinc-600">
              <p>
                Page <span className="font-medium text-zinc-900">{formLibraryPage + 1}</span> of{" "}
                <span className="font-medium text-zinc-900">{formLibraryTotalPages}</span>
                <span className="text-zinc-400"> · </span>
                {filteredForms.length} form{filteredForms.length === 1 ? "" : "s"}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={formLibraryPage <= 0}
                  onClick={() => setFormLibraryPage((p) => Math.max(0, p - 1))}
                  className={`${ui.btnSecondary} px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-40`}
                >
                  {buttonLabel("Previous")}
                </button>
                <button
                  type="button"
                  disabled={formLibraryPage >= formLibraryTotalPages - 1}
                  onClick={() =>
                    setFormLibraryPage((p) => Math.min(formLibraryTotalPages - 1, p + 1))
                  }
                  className={`${ui.btnSecondary} px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-40`}
                >
                  {buttonLabel("Next")}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
