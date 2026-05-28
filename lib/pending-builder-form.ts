import type { Form } from "@/lib/forms";

const STORAGE_KEY = "truepaper_pending_builder_form";

/** Stash a freshly created form so the builder can open it before the forms list reloads. */
export function stashPendingBuilderForm(form: Form): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(form));
  } catch {
    /* ignore quota / private mode */
  }
}

function readPendingBuilderFormRaw(): Form | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Form;
    if (!parsed?.id) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearPendingBuilderForm(): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Pending form for this id, if any (does not remove from storage). */
export function peekPendingBuilderForm(formId: string): Form | null {
  const pending = readPendingBuilderFormRaw();
  if (!pending || pending.id !== formId) {
    return null;
  }
  return pending;
}

/** Merge a pending form into a list when the API response has not caught up yet. */
export function mergePendingBuilderForm(forms: Form[], formId: string): Form[] {
  if (forms.some((form) => form.id === formId)) {
    clearPendingBuilderForm();
    return forms;
  }
  const pending = peekPendingBuilderForm(formId);
  if (!pending) {
    return forms;
  }
  clearPendingBuilderForm();
  return [...forms, pending];
}
