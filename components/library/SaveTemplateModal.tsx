"use client";

import { useEffect, useState } from "react";

import type { SaveTemplateInput, TemplateScope, TemplateSourceKind } from "@/lib/library/types";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import { focusRing, ui } from "@/lib/ui";
import { requestJson } from "@/lib/request-json";

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved?: (templateId: string) => void;
  sourceKind: TemplateSourceKind;
  formId?: string;
  questionId?: string;
  liveSessionId?: string;
  defaultTitle?: string;
  defaultSubject?: string;
  defaultGradeLevel?: string;
};

const CURRICULUM_SUGGESTIONS = ["NUSH", "NMT", "DPA", "Algebra", "Geometry", "History", "Biology"];

export function SaveTemplateModal({
  open,
  onClose,
  onSaved,
  sourceKind,
  formId,
  questionId,
  liveSessionId,
  defaultTitle = "",
  defaultSubject = "",
  defaultGradeLevel = "",
}: Props) {
  const t = useTranslations();
  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState("");
  const [scope, setScope] = useState<TemplateScope>("private");
  const [language, setLanguage] = useState<"en" | "uk">("en");
  const [subject, setSubject] = useState(defaultSubject);
  const [gradeLevel, setGradeLevel] = useState(defaultGradeLevel);
  const [curriculumTags, setCurriculumTags] = useState("");
  const [nmtDpaRelevant, setNmtDpaRelevant] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [hasOrg, setHasOrg] = useState(false);
  const [hasDept, setHasDept] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    setTitle(defaultTitle);
    setSubject(defaultSubject);
    setGradeLevel(defaultGradeLevel);
    setError("");
    void requestJson<{ profile: { organizationId: string | null; departmentId: string | null } }>(
      "/api/library/org",
    )
      .then((data) => {
        setHasOrg(Boolean(data.profile.organizationId));
        setHasDept(Boolean(data.profile.departmentId));
      })
      .catch(() => {
        setHasOrg(false);
        setHasDept(false);
      });
  }, [open, defaultTitle, defaultSubject, defaultGradeLevel]);

  if (!open) {
    return null;
  }

  const handleSave = async () => {
    if (!title.trim()) {
      setError(t("templateLibrary.save.titleRequired"));
      return;
    }
    setSaving(true);
    setError("");
    try {
      const body: SaveTemplateInput & {
        sourceKind: TemplateSourceKind;
        formId?: string;
        questionId?: string;
        liveSessionId?: string;
      } = {
        sourceKind,
        title: title.trim(),
        description: description.trim(),
        scope,
        language,
        subject: subject.trim(),
        gradeLevel: gradeLevel.trim(),
        curriculumTags: curriculumTags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        nmtDpaRelevant,
      };
      if (sourceKind === "form" && formId) body.formId = formId;
      if (sourceKind === "question" && questionId) body.questionId = questionId;
      if (sourceKind === "session" && liveSessionId) body.liveSessionId = liveSessionId;

      const result = await requestJson<{ templateId: string }>("/api/library/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      onSaved?.(result.templateId);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("templateLibrary.save.failed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="save-template-title"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[var(--tp-radius)] border border-[var(--tp-border)] bg-[var(--tp-surface)] p-5 shadow-xl">
        <h2 id="save-template-title" className="text-lg font-semibold text-[var(--tp-text)]">
          {t("templateLibrary.save.title")}
        </h2>
        <p className="mt-1 text-sm text-[var(--tp-text-secondary)]">
          {t(`templateLibrary.save.source.${sourceKind}`)}
        </p>

        <div className="mt-4 space-y-3">
          <label className={ui.label}>
            {t("templateLibrary.save.name")}
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="tp-input mt-1 w-full"
            />
          </label>
          <label className={ui.label}>
            {t("templateLibrary.save.description")}
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="tp-input mt-1 w-full"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={ui.label}>
              {t("templateLibrary.filters.subject")}
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="tp-input mt-1 w-full"
                placeholder={t("templateLibrary.filters.subjectPlaceholder")}
              />
            </label>
            <label className={ui.label}>
              {t("templateLibrary.filters.grade")}
              <input
                type="text"
                value={gradeLevel}
                onChange={(e) => setGradeLevel(e.target.value)}
                className="tp-input mt-1 w-full"
                placeholder="9, 10, 11…"
              />
            </label>
          </div>
          <label className={ui.label}>
            {t("templateLibrary.save.curriculumTags")}
            <input
              type="text"
              value={curriculumTags}
              onChange={(e) => setCurriculumTags(e.target.value)}
              className="tp-input mt-1 w-full"
              placeholder={CURRICULUM_SUGGESTIONS.join(", ")}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={nmtDpaRelevant}
              onChange={(e) => setNmtDpaRelevant(e.target.checked)}
            />
            {t("templateLibrary.filters.nmtDpa")}
          </label>
          <fieldset>
            <legend className={ui.sectionTitle}>{t("templateLibrary.save.scope")}</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {(["private", "department", "school", "public"] as const).map((s) => {
                const disabled =
                  (s === "department" && !hasDept) || (s === "school" && !hasOrg);
                return (
                  <label
                    key={s}
                    className={`flex cursor-pointer items-center gap-2 rounded-[var(--tp-radius-sm)] border px-3 py-2 text-sm ${
                      scope === s
                        ? "border-[var(--tp-accent)] bg-[var(--tp-accent-soft)]"
                        : "border-[var(--tp-border)]"
                    } ${disabled ? "opacity-50" : ""}`}
                  >
                    <input
                      type="radio"
                      name="template-scope"
                      value={s}
                      checked={scope === s}
                      disabled={disabled}
                      onChange={() => setScope(s)}
                    />
                    {t(`templateLibrary.scope.${s}`)}
                  </label>
                );
              })}
            </div>
            {!hasDept ? (
              <p className="mt-2 text-xs text-[var(--tp-text-muted)]">
                {t("templateLibrary.save.joinDeptHint")}
              </p>
            ) : null}
          </fieldset>
          <label className={ui.label}>
            {t("templateLibrary.filters.language")}
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as "en" | "uk")}
              className="tp-input mt-1 w-full"
            >
              <option value="en">English</option>
              <option value="uk">Українська</option>
            </select>
          </label>
        </div>

        {error ? <p className="mt-3 text-sm text-[var(--tp-warning-text)]">{error}</p> : null}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className={`tp-btn-ghost min-h-11 px-4 ${focusRing}`}>
            {t("common.cancel")}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
            className={`tp-btn-primary min-h-11 px-4 ${focusRing}`}
          >
            {saving ? t("common.saving") : t("templateLibrary.save.submit")}
          </button>
        </div>
      </div>
    </div>
  );
}
