/** Avatar tint pairs for form library identity chips. */
const AVATAR_TINTS = [
  { bg: "#e0e7ff", text: "#4338ca" },
  { bg: "#dcfce7", text: "#15803d" },
  { bg: "#fef3c7", text: "#b45309" },
  { bg: "#fce7f3", text: "#be185d" },
  { bg: "#e0f2fe", text: "#0369a1" },
  { bg: "#ede9fe", text: "#6d28d9" },
] as const;

export type FormAvatarTint = (typeof AVATAR_TINTS)[number];

export function formInitial(title: string): string {
  const trimmed = title.trim();
  return (trimmed.charAt(0) || "F").toUpperCase();
}

export function avatarTintForForm(formId: string): FormAvatarTint {
  let hash = 0;
  for (let i = 0; i < formId.length; i += 1) {
    hash = (hash * 31 + formId.charCodeAt(i)) >>> 0;
  }
  return AVATAR_TINTS[hash % AVATAR_TINTS.length]!;
}

export type LastRunAge =
  | { kind: "never" }
  | { kind: "today" }
  | { kind: "days"; n: number }
  | { kind: "weeks"; n: number }
  | { kind: "months"; n: number }
  | { kind: "years"; n: number };

export function lastRunAge(iso: string | null | undefined, now: number = Date.now()): LastRunAge {
  if (!iso) {
    return { kind: "never" };
  }
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) {
    return { kind: "never" };
  }
  const days = Math.max(0, Math.floor((now - then) / 86_400_000));
  if (days < 1) {
    return { kind: "today" };
  }
  if (days < 7) {
    return { kind: "days", n: days };
  }
  if (days < 30) {
    return { kind: "weeks", n: Math.max(1, Math.round(days / 7)) };
  }
  if (days < 365) {
    return { kind: "months", n: Math.max(1, Math.round(days / 30)) };
  }
  return { kind: "years", n: Math.max(1, Math.round(days / 365)) };
}
