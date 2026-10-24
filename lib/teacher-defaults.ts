import type { DeliveryMode } from "@/lib/offline/config";

/** Per-teacher session defaults (Settings → Exam defaults). */
export type TeacherDefaults = {
  /** 5..480, or null for no time limit. */
  durationMinutes: number | null;
  deliveryMode: DeliveryMode;
  acceptLateSync: boolean;
  liveFeedback: boolean;
};

export const DURATION_PRESETS = [30, 45, 60, 90] as const;

/** "Reset to recommended" and the value used when a teacher has never saved any. */
export const RECOMMENDED_TEACHER_DEFAULTS: TeacherDefaults = {
  durationMinutes: 45,
  deliveryMode: "live",
  acceptLateSync: true,
  liveFeedback: true,
};

export type TeacherDefaultsRow = {
  duration_minutes?: number | null;
  delivery_mode?: string | null;
  accept_late_sync?: boolean | null;
  live_feedback?: boolean | null;
};

function isDeliveryMode(value: unknown): value is DeliveryMode {
  return value === "live" || value === "self_paced" || value === "hybrid";
}

/** Normalise a DB row; a missing row means the recommended defaults. */
export function teacherDefaultsFromRow(row: TeacherDefaultsRow | null | undefined): TeacherDefaults {
  if (!row) {
    return { ...RECOMMENDED_TEACHER_DEFAULTS };
  }
  const raw = row.duration_minutes;
  const durationMinutes =
    typeof raw === "number" && Number.isFinite(raw)
      ? Math.min(480, Math.max(5, Math.round(raw)))
      : null;
  return {
    durationMinutes,
    deliveryMode: isDeliveryMode(row.delivery_mode) ? row.delivery_mode : "live",
    acceptLateSync: row.accept_late_sync !== false,
    liveFeedback: row.live_feedback !== false,
  };
}

/** Validate a client payload (PUT /api/teacher/defaults). Returns null when invalid. */
export function parseTeacherDefaults(input: unknown): TeacherDefaults | null {
  if (!input || typeof input !== "object") {
    return null;
  }
  const o = input as Record<string, unknown>;
  let durationMinutes: number | null;
  if (o.durationMinutes === null) {
    durationMinutes = null;
  } else if (typeof o.durationMinutes === "number" && Number.isFinite(o.durationMinutes)) {
    const n = Math.round(o.durationMinutes);
    if (n < 5 || n > 480) {
      return null;
    }
    durationMinutes = n;
  } else {
    return null;
  }
  if (!isDeliveryMode(o.deliveryMode)) {
    return null;
  }
  if (typeof o.acceptLateSync !== "boolean" || typeof o.liveFeedback !== "boolean") {
    return null;
  }
  return {
    durationMinutes,
    deliveryMode: o.deliveryMode,
    acceptLateSync: o.acceptLateSync,
    liveFeedback: o.liveFeedback,
  };
}

export function teacherDefaultsToRow(d: TeacherDefaults): Omit<Required<TeacherDefaultsRow>, never> {
  return {
    duration_minutes: d.durationMinutes,
    delivery_mode: d.deliveryMode,
    accept_late_sync: d.acceptLateSync,
    live_feedback: d.liveFeedback,
  };
}

export function teacherDefaultsEqual(a: TeacherDefaults, b: TeacherDefaults): boolean {
  return (
    a.durationMinutes === b.durationMinutes &&
    a.deliveryMode === b.deliveryMode &&
    a.acceptLateSync === b.acceptLateSync &&
    a.liveFeedback === b.liveFeedback
  );
}
