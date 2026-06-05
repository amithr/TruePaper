"use client";

import { useEffect, useState } from "react";

import { TemplateLibraryBrowser } from "@/components/library/TemplateLibraryBrowser";
import { TeacherAppNav } from "@/components/TeacherAppNav";
import { deferEffect } from "@/lib/defer-effect";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import { focusRing, ui } from "@/lib/ui";
import { requestJson } from "@/lib/request-json";

export default function TemplateLibraryPage() {
  const t = useTranslations();
  const [statusMessage, setStatusMessage] = useState("");
  const [orgSaving, setOrgSaving] = useState(false);
  const [organizationId, setOrganizationId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [orgs, setOrgs] = useState<Array<{ id: string; name: string }>>([]);
  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);
  const loadOrg = async () => {
    try {
      const data = await requestJson<{
        profile: {
          organizationId: string | null;
          departmentId: string | null;
        };
        organizations: Array<{ id: string; name: string }>;
        departments: Array<{ id: string; name: string }>;
      }>("/api/library/org");
      setOrganizationId(data.profile.organizationId ?? "");
      setDepartmentId(data.profile.departmentId ?? "");
      setOrgs(data.organizations);
      setDepartments(data.departments);

    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    deferEffect(() => {
      void loadOrg();
    });
  }, []);

  const saveOrg = async () => {
    setOrgSaving(true);
    setStatusMessage("");
    try {
      await requestJson("/api/library/org", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: organizationId || null,
          departmentId: departmentId || null,
        }),
      });
      setStatusMessage(t("templateLibrary.org.saved"));
      await loadOrg();
    } catch (e) {
      setStatusMessage(e instanceof Error ? e.message : t("templateLibrary.org.failed"));
    } finally {
      setOrgSaving(false);
    }
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-8">
        <TeacherAppNav active="templates" />
        <h1 className="mt-6 text-2xl font-bold tracking-tight">{t("templateLibrary.title")}</h1>
        <p className="mt-1 text-sm text-[var(--tp-text-secondary)]">{t("templateLibrary.subtitle")}</p>
      </header>

      <details className="mb-8 rounded-[var(--tp-radius-sm)] border border-[var(--tp-border)] bg-[var(--tp-bg-subtle)] px-4 py-3">
        <summary className={`cursor-pointer text-sm font-medium ${focusRing}`}>
          {t("templateLibrary.org.title")}
        </summary>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className={ui.label}>
            {t("templateLibrary.org.school")}
            <select
              value={organizationId}
              onChange={(e) => {
                setOrganizationId(e.target.value);
                setDepartmentId("");
              }}
              className="tp-input mt-1 w-full"
            >
              <option value="">{t("templateLibrary.org.none")}</option>
              {orgs.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </label>
          <label className={ui.label}>
            {t("templateLibrary.org.department")}
            <select
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              disabled={!organizationId}
              className="tp-input mt-1 w-full"
            >
              <option value="">{t("templateLibrary.org.none")}</option>
              {departments.map((dept) => (
                <option key={dept.id} value={dept.id}>
                  {dept.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          type="button"
          disabled={orgSaving}
          onClick={() => void saveOrg()}
          className={`tp-btn-secondary mt-3 min-h-11 px-4 text-sm ${focusRing}`}
        >
          {orgSaving ? t("common.saving") : t("templateLibrary.org.save")}
        </button>
      </details>

      {statusMessage ? (
        <p className="mb-4 text-sm text-[var(--tp-text-secondary)]">{statusMessage}</p>
      ) : null}

      <TemplateLibraryBrowser onError={setStatusMessage} />
    </main>
  );
}
