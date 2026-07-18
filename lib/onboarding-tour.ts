"use client";

import { driver, type Config, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";

import { BUILDER_TOUR_PENDING_KEY } from "@/lib/onboarding-tour-key";
import type { TranslationPath } from "@/lib/i18n/types";

export { BUILDER_TOUR_PENDING_KEY };

type Translator = (key: TranslationPath, vars?: Record<string, string | number>) => string;

type StepDef = {
  /** CSS selector for the anchor, or null for a centered (no-element) step. */
  selector: string | null;
  titleKey: TranslationPath;
  bodyKey: TranslationPath;
};

function toDriveSteps(t: Translator, defs: StepDef[]): DriveStep[] {
  return defs
    .filter((d) => d.selector === null || document.querySelector(d.selector))
    .map((d) => ({
      element: d.selector ?? undefined,
      popover: {
        title: t(d.titleKey),
        description: t(d.bodyKey),
      },
    }));
}

function baseConfig(t: Translator, steps: DriveStep[], onDone: () => void): Config {
  let finished = false;
  const finish = () => {
    if (finished) {
      return;
    }
    finished = true;
    onDone();
  };
  return {
    steps,
    showProgress: steps.length > 1,
    // driver.js fills {{current}}/{{total}}; our i18n placeholders resolve to those tokens.
    progressText: t("help.tour.common.progress", { current: "{{current}}", total: "{{total}}" }),
    nextBtnText: t("help.tour.common.next"),
    prevBtnText: t("help.tour.common.back"),
    doneBtnText: t("help.tour.common.done"),
    popoverClass: "tp-tour-popover",
    allowClose: true,
    overlayColor: "rgba(15, 23, 42, 0.55)",
    onDestroyed: () => finish(),
  };
}

/** Segment A — runs on a teacher's first authenticated dashboard mount. */
export function startDashboardTour(t: Translator, onDone: () => void): boolean {
  const steps = toDriveSteps(t, [
    {
      selector: '[data-tour="welcome"]',
      titleKey: "help.tour.dashboard.welcome.title",
      bodyKey: "help.tour.dashboard.welcome.body",
    },
    {
      selector: "#running-sessions",
      titleKey: "help.tour.dashboard.running.title",
      bodyKey: "help.tour.dashboard.running.body",
    },
    {
      selector: "#form-library",
      titleKey: "help.tour.dashboard.library.title",
      bodyKey: "help.tour.dashboard.library.body",
    },
    {
      selector: '[data-tour="new-form"]',
      titleKey: "help.tour.dashboard.createForm.title",
      bodyKey: "help.tour.dashboard.createForm.body",
    },
    {
      selector: '[data-tour="import-exam"]',
      titleKey: "help.tour.dashboard.importForm.title",
      bodyKey: "help.tour.dashboard.importForm.body",
    },
  ]);
  if (steps.length === 0) {
    onDone();
    return false;
  }
  driver(baseConfig(t, steps, onDone)).drive();
  return true;
}

/** Segment B — runs once in the builder after the dashboard segment. */
export function startBuilderTour(t: Translator, onDone: () => void): boolean {
  const steps = toDriveSteps(t, [
    {
      selector: '[data-tour="form-title"], .tp-builder-details__collapsed',
      titleKey: "help.tour.builder.title.title",
      bodyKey: "help.tour.builder.title.body",
    },
    {
      selector: '[data-tour="add-question"]',
      titleKey: "help.tour.builder.addQuestion.title",
      bodyKey: "help.tour.builder.addQuestion.body",
    },
    {
      selector: '[data-tour="builder-autosave"]',
      titleKey: "help.tour.builder.save.title",
      bodyKey: "help.tour.builder.save.body",
    },
  ]);
  if (steps.length === 0) {
    onDone();
    return false;
  }
  driver(baseConfig(t, steps, onDone)).drive();
  return true;
}
