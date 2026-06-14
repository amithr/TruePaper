"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { LoadingBar } from "@/components/LoadingBar";
import { parseFormStartSearchParams } from "@/lib/form-start-link";
import { useLocaleRouter as useRouter } from "@/lib/i18n/client";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import { startLiveSession } from "@/lib/start-live-session";
import { ui } from "@/lib/ui";

/**
 * Teacher quick-start: opening this link creates a live session for the form
 * (using URL query params for duration / delivery) and redirects to the roster.
 */
export default function FormQuickStartPage() {
  const router = useRouter();
  const t = useTranslations();
  const params = useParams();
  const searchParams = useSearchParams();
  const formId = typeof params.formId === "string" ? params.formId : "";
  const [error, setError] = useState("");

  const startedRef = useRef(false);

  useEffect(() => {
    if (!formId || startedRef.current) {
      return;
    }
    startedRef.current = true;

    const options = parseFormStartSearchParams(searchParams);

    void (async () => {
      try {
        const created = await startLiveSession(formId, options);
        router.replace(`/dashboard/sessions/${created.liveSessionId}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : t("formLibrary.startLink.errors.failed"));
      }
    })();
  }, [formId, router, searchParams, t]);

  if (error) {
    return (
      <div className={ui.page}>
        <main className={`${ui.pageMain} space-y-4`}>
          <p className="tp-alert tp-alert-error">{error}</p>
          <button type="button" onClick={() => router.replace("/dashboard")} className={ui.btnSecondary}>
            {t("formLibrary.startLink.backToLibrary")}
          </button>
        </main>
      </div>
    );
  }

  return (
    <div className={ui.page}>
      <main className={ui.pageMain}>
        <LoadingBar className="max-w-md" label={t("formLibrary.startLink.starting")} />
      </main>
    </div>
  );
}
