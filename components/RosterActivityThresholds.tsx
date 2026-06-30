"use client";

import { useEffect, useId, useRef, useState } from "react";

import { useTranslations } from "@/lib/i18n/I18nProvider";
import {
  ROSTER_ACTIVITY_MAX,
  ROSTER_ACTIVITY_MIN,
  normalizeRosterActivityThresholds,
  type RosterActivityThresholds,
} from "@/lib/roster-activity";
import { focusRing } from "@/lib/ui";

type Props = {
  thresholds: RosterActivityThresholds;
  onChange: (next: RosterActivityThresholds) => void;
};

/** Small, per-session inline control for the inactivity heatmap thresholds. */
export function RosterActivityThresholds({ thresholds, onChange }: Props) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const commit = (partial: Partial<RosterActivityThresholds>) => {
    onChange(normalizeRosterActivityThresholds({ ...thresholds, ...partial }));
  };

  return (
    <div ref={rootRef} className="tp-roster-activity-cfg">
      <button
        type="button"
        className={`tp-roster-activity-cfg__btn ${focusRing}`}
        aria-expanded={open}
        aria-controls={panelId}
        data-testid="roster-activity-config"
        onClick={() => setOpen((v) => !v)}
      >
        {t("session.activity.configLabel", {
          soft: thresholds.softMin,
          strong: thresholds.strongMin,
        })}
      </button>

      {open ? (
        <div id={panelId} className="tp-roster-activity-cfg__panel" role="group" aria-label={t("session.activity.title")}>
          <p className="tp-roster-activity-cfg__title">{t("session.activity.title")}</p>
          <label className="tp-roster-activity-cfg__field">
            <span>{t("session.activity.softLabel")}</span>
            <input
              type="number"
              min={ROSTER_ACTIVITY_MIN}
              max={ROSTER_ACTIVITY_MAX - 1}
              value={thresholds.softMin}
              className="tp-roster-activity-cfg__input"
              onChange={(e) => commit({ softMin: Number(e.target.value) })}
            />
          </label>
          <label className="tp-roster-activity-cfg__field">
            <span>{t("session.activity.strongLabel")}</span>
            <input
              type="number"
              min={ROSTER_ACTIVITY_MIN + 1}
              max={ROSTER_ACTIVITY_MAX}
              value={thresholds.strongMin}
              className="tp-roster-activity-cfg__input"
              onChange={(e) => commit({ strongMin: Number(e.target.value) })}
            />
          </label>
          <p className="tp-roster-activity-cfg__hint">{t("session.activity.hint")}</p>
        </div>
      ) : null}
    </div>
  );
}
