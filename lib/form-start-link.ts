import type { Locale } from "@/lib/i18n/config";
import { localizeHref } from "@/lib/i18n/navigation";

export type FormStartLinkOptions = {
  durationMinutes?: number;
  noTimeLimit?: boolean;
  deliveryMode?: "live" | "self_paced" | "hybrid";
  acceptLateSync?: boolean;
};

const clampMinutes = (n: number) => Math.min(480, Math.max(5, Math.round(n) || 45));

/** Relative path (without locale) for the teacher quick-start page. */
export function buildFormStartPath(formId: string, options: FormStartLinkOptions = {}): string {
  const id = formId.trim();
  if (!id) {
    return "";
  }
  const params = new URLSearchParams();
  if (options.noTimeLimit) {
    params.set("noLimit", "1");
  } else {
    params.set("minutes", String(clampMinutes(options.durationMinutes ?? 45)));
  }
  if (options.deliveryMode && options.deliveryMode !== "live") {
    params.set("delivery", options.deliveryMode);
  }
  if (options.acceptLateSync === false) {
    params.set("lateSync", "0");
  }
  const qs = params.toString();
  return `/dashboard/forms/${encodeURIComponent(id)}/start${qs ? `?${qs}` : ""}`;
}

/** Absolute URL for copying/sharing (includes locale prefix). */
export function buildFormStartUrl(
  origin: string,
  locale: Locale,
  formId: string,
  options: FormStartLinkOptions = {},
): string {
  const path = buildFormStartPath(formId, options);
  if (!origin || !path) {
    return "";
  }
  return `${origin.replace(/\/$/, "")}${localizeHref(path, locale)}`;
}

/** Parse quick-start query params from the start page URL. */
export function parseFormStartSearchParams(search: URLSearchParams): FormStartLinkOptions {
  const noTimeLimit = search.get("noLimit") === "1" || search.get("noLimit") === "true";
  const deliveryRaw = search.get("delivery");
  const deliveryMode =
    deliveryRaw === "self_paced" || deliveryRaw === "hybrid" ? deliveryRaw : "live";
  const lateSyncRaw = search.get("lateSync");
  const acceptLateSync = lateSyncRaw !== "0" && lateSyncRaw !== "false";
  const minutesRaw = Number(search.get("minutes"));
  return {
    noTimeLimit,
    durationMinutes: noTimeLimit ? undefined : clampMinutes(minutesRaw || 45),
    deliveryMode,
    acceptLateSync,
  };
}
