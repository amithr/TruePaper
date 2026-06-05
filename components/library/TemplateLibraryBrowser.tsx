"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { TemplateScopeBadge } from "@/components/library/TemplateScopeBadge";
import { LoadingBar } from "@/components/LoadingBar";
import { mergeBrowseWithCache, touchRecentTemplate } from "@/lib/library/cache";
import type { LibraryBrowseResult, LibraryTemplateDetail, LibraryTemplateSummary } from "@/lib/library/types";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import { focusRing, ui } from "@/lib/ui";
import { requestJson } from "@/lib/request-json";
import { useLocaleRouter as useRouter } from "@/lib/i18n/client";

const PAGE_SIZE = 12;

type Props = {
  initialScope?: string;
  onError?: (message: string) => void;
};

export function TemplateLibraryBrowser({ initialScope = "", onError }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const [scope, setScope] = useState(initialScope || "mine");
  const [q, setQ] = useState("");
  const [subject, setSubject] = useState("");
  const [gradeLevel, setGradeLevel] = useState("");
  const [language, setLanguage] = useState("");
  const [nmtDpa, setNmtDpa] = useState(false);
  const [interactionType, setInteractionType] = useState("");
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<LibraryBrowseResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [fromCache, setFromCache] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [preview, setPreview] = useState<LibraryTemplateDetail | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [cloningId, setCloningId] = useState<string | null>(null);
  const [updates, setUpdates] = useState<LibraryTemplateSummary[]>([]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(PAGE_SIZE));
    params.set("scope", scope);
    if (q.trim()) params.set("q", q.trim());
    if (subject.trim()) params.set("subject", subject.trim());
    if (gradeLevel.trim()) params.set("gradeLevel", gradeLevel.trim());
    if (language) params.set("language", language);
    if (nmtDpa) params.set("nmtDpa", "1");
    if (interactionType) params.set("interactionType", interactionType);
    return params.toString();
  }, [page, scope, q, subject, gradeLevel, language, nmtDpa, interactionType]);

  const loadBrowse = useCallback(async () => {
    setLoading(true);
    try {
      const data = await requestJson<LibraryBrowseResult>(`/api/library/templates?${queryString}`);
      setResult(mergeBrowseWithCache(data, scope));
      setFromCache(false);
    } catch (e) {
      const cached = mergeBrowseWithCache(null, scope);
      setResult(cached);
      setFromCache(cached.items.length > 0);
      if (cached.items.length === 0) {
        onError?.(e instanceof Error ? e.message : t("templateLibrary.errors.load"));
      }
    } finally {
      setLoading(false);
    }
  }, [queryString, scope, onError, t]);

  useEffect(() => {
    void loadBrowse();
  }, [loadBrowse]);

  useEffect(() => {
    void requestJson<{ items: LibraryTemplateSummary[] }>("/api/library/updates")
      .then((data) => setUpdates(data.items))
      .catch(() => setUpdates([]));
  }, [result]);

  useEffect(() => {
    setPage(0);
  }, [scope, q, subject, gradeLevel, language, nmtDpa, interactionType]);

  const openPreview = async (item: LibraryTemplateSummary) => {
    setPreviewId(item.id);
    setPreviewLoading(true);
    touchRecentTemplate(item);
    try {
      const data = await requestJson<{ template: LibraryTemplateDetail }>(
        `/api/library/templates/${item.id}`,
      );
      setPreview(data.template);
    } catch (e) {
      onError?.(e instanceof Error ? e.message : t("templateLibrary.errors.preview"));
      setPreviewId(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const cloneTemplate = async (templateId: string) => {
    setCloningId(templateId);
    try {
      const data = await requestJson<{ formId: string }>(
        `/api/library/templates/${templateId}/clone`,
        { method: "POST" },
      );
      router.push(`/?form=${data.formId}`);
    } catch (e) {
      onError?.(e instanceof Error ? e.message : t("templateLibrary.errors.clone"));
    } finally {
      setCloningId(null);
    }
  };

  const items = result?.items ?? [];

  return (
    <div className="space-y-6">
      {fromCache ? (
        <p className="rounded-[var(--tp-radius-sm)] border border-[var(--tp-warning-border)] bg-[var(--tp-warning-soft)] px-3 py-2 text-sm text-[var(--tp-warning-text)]">
          {t("templateLibrary.offlineCache")}
        </p>
      ) : null}

      {updates.length > 0 ? (
        <div className="rounded-[var(--tp-radius-sm)] border border-[var(--tp-sky-border)] bg-[var(--tp-sky-soft)] px-3 py-3">
          <p className="text-sm font-medium text-[var(--tp-text)]">
            {t("templateLibrary.updatesAvailable", { n: updates.length })}
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {updates.slice(0, 3).map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={`font-medium text-[var(--tp-accent)] underline ${focusRing}`}
                  onClick={() => void openPreview(item)}
                >
                  {item.title}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {(["mine", "department", "school", "public", "shared"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setScope(s)}
            className={scope === s ? ui.pillActive : ui.pill}
          >
            {t(`templateLibrary.collections.${s}`)}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className={ui.label}>
          <span className="sr-only">{t("templateLibrary.search")}</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("templateLibrary.searchPlaceholder")}
            className="tp-input w-full"
          />
        </label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder={t("templateLibrary.filters.subjectPlaceholder")}
          className="tp-input"
        />
        <input
          type="text"
          value={gradeLevel}
          onChange={(e) => setGradeLevel(e.target.value)}
          placeholder={t("templateLibrary.filters.gradePlaceholder")}
          className="tp-input"
        />
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="tp-input"
        >
          <option value="">{t("templateLibrary.filters.allLanguages")}</option>
          <option value="en">EN</option>
          <option value="uk">UA</option>
        </select>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={nmtDpa} onChange={(e) => setNmtDpa(e.target.checked)} />
        {t("templateLibrary.filters.nmtDpa")}
      </label>

      {loading && !result ? (
        <LoadingBar label={t("templateLibrary.loading")} />
      ) : items.length === 0 ? (
        <p className="tp-empty">{t("templateLibrary.empty")}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <li key={item.id}>
              <article className="tp-template-card flex h-full flex-col rounded-[var(--tp-radius-sm)] border border-[var(--tp-border)] bg-[var(--tp-surface)] p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold text-[var(--tp-text)]">{item.title}</h3>
                  <TemplateScopeBadge scope={item.scope} />
                </div>
                {item.updateAvailable ? (
                  <span className="tp-update-pill mt-2 inline-block text-xs font-medium">
                    {t("templateLibrary.updateAvailable")}
                  </span>
                ) : null}
                <p className="mt-2 line-clamp-2 flex-1 text-xs text-[var(--tp-text-secondary)]">
                  {item.description || t("templateLibrary.noDescription")}
                </p>
                <dl className="mt-3 grid grid-cols-2 gap-1 text-[11px] text-[var(--tp-text-muted)]">
                  {item.subject ? (
                    <div>
                      <dt className="inline">{t("templateLibrary.filters.subject")}: </dt>
                      <dd className="inline">{item.subject}</dd>
                    </div>
                  ) : null}
                  {item.gradeLevel ? (
                    <div>
                      <dt className="inline">{t("templateLibrary.filters.grade")}: </dt>
                      <dd className="inline">{item.gradeLevel}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt className="inline">{t("templateLibrary.meta.questions")}: </dt>
                    <dd className="inline">{item.questionCount}</dd>
                  </div>
                  {item.authorName ? (
                    <div className="col-span-2">
                      <dt className="inline">{t("templateLibrary.meta.author")}: </dt>
                      <dd className="inline">{item.authorName}</dd>
                    </div>
                  ) : null}
                </dl>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void openPreview(item)}
                    className={`tp-btn-ghost min-h-10 flex-1 px-3 text-sm ${focusRing}`}
                  >
                    {t("templateLibrary.preview")}
                  </button>
                  <button
                    type="button"
                    disabled={cloningId === item.id}
                    onClick={() => void cloneTemplate(item.id)}
                    className={`tp-btn-primary min-h-10 flex-1 px-3 text-sm ${focusRing}`}
                  >
                    {cloningId === item.id ? t("common.saving") : t("templateLibrary.clone")}
                  </button>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}

      {result && result.total > PAGE_SIZE ? (
        <div className="flex items-center justify-between gap-3 text-sm">
          <button
            type="button"
            disabled={page <= 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className={`tp-btn-ghost min-h-10 px-3 ${focusRing}`}
          >
            {t("common.previous")}
          </button>
          <span className="text-[var(--tp-text-secondary)]">
            {t("templateLibrary.page", {
              current: page + 1,
              total: Math.ceil(result.total / PAGE_SIZE),
            })}
          </span>
          <button
            type="button"
            disabled={!result.hasMore}
            onClick={() => setPage((p) => p + 1)}
            className={`tp-btn-ghost min-h-10 px-3 ${focusRing}`}
          >
            {t("common.next")}
          </button>
        </div>
      ) : null}

      {previewId ? (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/35"
          role="dialog"
          aria-modal="true"
        >
          <aside className="flex h-full w-full max-w-md flex-col border-l border-[var(--tp-border)] bg-[var(--tp-surface)] shadow-xl">
            <div className="flex items-center justify-between border-b border-[var(--tp-border)] px-4 py-3">
              <h2 className="text-base font-semibold">{preview?.title ?? t("templateLibrary.preview")}</h2>
              <button
                type="button"
                onClick={() => {
                  setPreviewId(null);
                  setPreview(null);
                }}
                className={`tp-btn-ghost min-h-10 px-3 ${focusRing}`}
              >
                {t("common.close")}
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4">
              {previewLoading ? (
                <LoadingBar label={t("templateLibrary.loadingPreview")} />
              ) : preview ? (
                <div className="space-y-4 text-sm">
                  <div className="flex flex-wrap gap-2">
                    <TemplateScopeBadge scope={preview.scope} />
                    <span className="text-xs text-[var(--tp-text-muted)]">
                      v{preview.currentVersionNumber}
                    </span>
                  </div>
                  <p className="text-[var(--tp-text-secondary)]">{preview.description}</p>
                  {preview.authorName ? (
                    <p>
                      <span className="font-medium">{t("templateLibrary.meta.author")}: </span>
                      {preview.authorName}
                    </p>
                  ) : null}
                  {preview.curriculumTags.length > 0 ? (
                    <p>
                      <span className="font-medium">{t("templateLibrary.save.curriculumTags")}: </span>
                      {preview.curriculumTags.join(", ")}
                    </p>
                  ) : null}
                  <ol className="space-y-3 border-t border-[var(--tp-border)] pt-4">
                    {preview.snapshot.questions.map((q, i) => (
                      <li
                        key={`preview-q-${i}`}
                        className="rounded-[var(--tp-radius-sm)] border border-[var(--tp-border)] bg-[var(--tp-bg-subtle)] px-3 py-2"
                      >
                        <p className="font-medium">
                          {i + 1}. {q.prompt || t("common.untitledQuestion")}
                        </p>
                        <p className="mt-1 text-xs text-[var(--tp-text-muted)]">
                          {q.type} · {q.points} pt
                        </p>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}
            </div>
            {preview ? (
              <div className="border-t border-[var(--tp-border)] p-4">
                <button
                  type="button"
                  disabled={cloningId === preview.id}
                  onClick={() => void cloneTemplate(preview.id)}
                  className={`tp-btn-primary min-h-11 w-full ${focusRing}`}
                >
                  {cloningId === preview.id
                    ? t("common.saving")
                    : t("templateLibrary.cloneToDraft")}
                </button>
              </div>
            ) : null}
          </aside>
        </div>
      ) : null}
    </div>
  );
}
