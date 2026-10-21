"use client";

import {
  Battery,
  BatteryFull,
  BatteryLow,
  BatteryWarning,
  Check,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Smartphone,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { deferEffect } from "@/lib/defer-effect";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import {
  DEMO_CHAPTER_STARTS,
  DEMO_LOOP_MS,
  DEMO_STILL_T,
  demoFrame,
  type DemoFrame,
  type DemoOutage,
} from "@/lib/landing-demo";
import { focusRing } from "@/lib/ui";

type Props = {
  outageKind?: "wifi" | "power";
  showOutage?: boolean;
  /** Playback speed multiplier (0.5–2.5). */
  demoSpeed?: number;
  autoplay?: boolean;
};

/** ~20 fps is plenty for typewriter + state changes and keeps re-renders cheap. */
const FRAME_MS = 50;
/** Cap per-frame time so returning to a background tab doesn't jump the story. */
const MAX_STEP_MS = 100;

function useDemoClock(autoplay: boolean, speed: number) {
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(autoplay);
  const acc = useRef(0);

  // Reduced motion: hold a meaningful still frame; chips / play still work.
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      deferEffect(() => {
        setPlaying(false);
        setT(DEMO_STILL_T);
      });
    }
  }, []);

  useEffect(() => {
    if (!playing) {
      return;
    }
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const step = Math.min(MAX_STEP_MS, now - last);
      last = now;
      acc.current += step * speed;
      if (acc.current >= FRAME_MS) {
        const delta = acc.current;
        acc.current = 0;
        setT((prev) => (prev + delta) % DEMO_LOOP_MS);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed]);

  const seek = useCallback((next: number) => {
    acc.current = 0;
    setT(next);
    setPlaying(true);
  }, []);

  return { t, playing, setPlaying, seek };
}

export function LandingDemo({
  outageKind = "wifi",
  showOutage = true,
  demoSpeed = 1,
  autoplay = true,
}: Props) {
  const t = useTranslations();
  const outage: DemoOutage = showOutage ? outageKind : "none";
  const clock = useDemoClock(autoplay, Math.max(0.5, Math.min(2.5, demoSpeed)));
  const f = demoFrame(clock.t, outage);

  const chapterLabels = [
    t("home.landing.demo.chapters.share"),
    t("home.landing.demo.chapters.join"),
    t("home.landing.demo.chapters.write"),
    outage === "power"
      ? t("home.landing.demo.chapters.powerCut")
      : outage === "wifi"
        ? t("home.landing.demo.chapters.wifiDrop")
        : t("home.landing.demo.chapters.keepTyping"),
    outage === "none" ? t("home.landing.demo.chapters.saved") : t("home.landing.demo.chapters.resync"),
    t("home.landing.demo.chapters.grade"),
  ];

  return (
    <div className="tp-lp-demo">
      <div className="tp-lp-stage" aria-hidden="true" data-testid="landing-demo-stage">
        <TeacherWindow f={f} />
        <Phone f={f} />
      </div>

      <div className="tp-lp-chapters">
        <button
          type="button"
          className={`tp-lp-chapters__play ${focusRing}`}
          aria-label={t("home.landing.demo.playPause")}
          aria-pressed={clock.playing}
          onClick={() => clock.setPlaying(!clock.playing)}
        >
          {clock.playing ? <Pause aria-hidden className="h-3.5 w-3.5" /> : <Play aria-hidden className="h-3.5 w-3.5" />}
        </button>
        <ol className="tp-lp-chapters__list">
          {chapterLabels.map((label, i) => (
            <li key={label}>
              <button
                type="button"
                className={`tp-lp-chip ${focusRing}`}
                data-active={f.activeChapter === i ? "true" : undefined}
                aria-current={f.activeChapter === i ? "step" : undefined}
                onClick={() => clock.seek(DEMO_CHAPTER_STARTS[i])}
              >
                <span className="tp-lp-chip__num">{String(i + 1).padStart(2, "0")}</span>
                {label}
              </button>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function TeacherWindow({ f }: { f: DemoFrame }) {
  const t = useTranslations();
  return (
    <div className="tp-lp-teacher">
      <div className="tp-lp-teacher__bar">
        <span className="tp-lp-dot" />
        <span className="tp-lp-dot" />
        <span className="tp-lp-dot" />
        <span className="tp-lp-teacher__title">{t("home.landing.demo.teacherWindow")}</span>
      </div>
      <div className="tp-lp-teacher__body">
        <div className="tp-lp-session">
          <div className="min-w-0">
            <div className="tp-lp-kicker tp-lp-kicker--accent">{t("home.landing.demo.liveSession")}</div>
            <div className="tp-lp-code">
              {f.codeChars.map((c, i) => (
                <span key={i} className="tp-lp-code__cell" data-shown={c.shown ? "true" : undefined}>
                  {c.shown ? c.ch : ""}
                </span>
              ))}
            </div>
          </div>
          <div className="tp-lp-session__timer">
            <div className="tp-lp-kicker">{t("home.landing.demo.timeLeft")}</div>
            <div className="tp-lp-mono tp-lp-session__time">{f.timer}</div>
          </div>
        </div>

        <div className="tp-lp-roster-head">
          <span>{t("home.landing.demo.students", { n: f.rosterCount })}</span>
          {f.needsCheck ? (
            <span className="tp-lp-warn-pill">
              <WifiOff aria-hidden className="h-3 w-3" />
              {t("home.landing.demo.needsCheck")}
            </span>
          ) : null}
        </div>

        <ul className="tp-lp-roster">
          <li className="tp-lp-rrow" data-collapsed={f.avaJoined ? undefined : "true"}>
            <span className="tp-lp-avatar tp-lp-avatar--violet">A</span>
            <span className="tp-lp-rrow__main">
              <span className="tp-lp-rrow__line">
                <span className="tp-lp-rrow__name">Ava</span>
                <span className="tp-lp-rrow__status">{avaStatusText(f, t)}</span>
              </span>
              <span className="tp-lp-mono tp-lp-rrow__mirror">
                {f.mirrorText}
                {f.mirrorStale ? <span className="tp-lp-rrow__stale">{t("home.landing.demo.lastSynced")}</span> : null}
              </span>
            </span>
            <AvaPill f={f} />
          </li>
          <li className="tp-lp-rrow">
            <span className="tp-lp-avatar tp-lp-avatar--sky">L</span>
            <span className="tp-lp-rrow__main">
              <span className="tp-lp-rrow__line">
                <span className="tp-lp-rrow__name">Liam</span>
                <span className="tp-lp-rrow__status">{t("home.landing.demo.workingQ3")}</span>
              </span>
              <span className="tp-lp-bar" style={{ width: "45%" }} />
            </span>
            <span className="tp-lp-mono tp-lp-rrow__count">2/5</span>
          </li>
          <li className="tp-lp-rrow">
            <span className="tp-lp-avatar tp-lp-avatar--amber">N</span>
            <span className="tp-lp-rrow__main">
              <span className="tp-lp-rrow__line">
                <span className="tp-lp-rrow__name">Noah</span>
                <span className="tp-lp-rrow__status">
                  {t("home.landing.demo.handedInAt", { time: "10:38" })}
                </span>
              </span>
              <span className="tp-lp-bar tp-lp-bar--done" style={{ width: "90%" }} />
            </span>
            <span className="tp-status tp-status-finished tp-lp-pill">
              <span className="tp-status-dot" />
              {t("home.landing.demo.pillSubmitted")}
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
}

function avaStatusText(f: DemoFrame, t: ReturnType<typeof useTranslations>): string {
  switch (f.avaStatus) {
    case "workingQ1":
      return t("home.landing.demo.workingQ1");
    case "offline":
      return t("session.roster.statusOffline");
    case "handedIn":
      return t("home.landing.demo.handedInAt", { time: "10:43" });
    default:
      return "";
  }
}

function AvaPill({ f }: { f: DemoFrame }) {
  const t = useTranslations();
  switch (f.avaPill) {
    case "typing":
      return (
        <span className="tp-status tp-status-typing tp-lp-pill">
          <span className="tp-status-dot" />
          {t("home.landing.demo.pillTyping")}
        </span>
      );
    case "offline":
      return (
        <span className="tp-status tp-status-idle tp-lp-pill">
          <WifiOff aria-hidden className="h-3 w-3" />
          {t("home.landing.demo.pillOffline")}
        </span>
      );
    case "submitted":
      return (
        <span className="tp-status tp-status-finished tp-lp-pill">
          <span className="tp-status-dot" />
          {t("home.landing.demo.pillSubmitted")}
        </span>
      );
    case "working":
      return (
        <span className="tp-status tp-status-idle tp-lp-pill">
          <span className="tp-status-dot" />
          {t("home.landing.demo.pillWorking")}
        </span>
      );
    default:
      return (
        <span className="tp-status tp-status-idle tp-lp-pill">{t("home.landing.demo.pillJoined")}</span>
      );
  }
}

function Phone({ f }: { f: DemoFrame }) {
  const t = useTranslations();
  const BatteryIcon = f.battery === "low" ? BatteryLow : f.battery === "empty" ? Battery : BatteryFull;
  return (
    <div className="tp-lp-phone">
      <span className="tp-lp-phone__notch" />
      <div className="tp-lp-phone__screen" data-dark={f.screen === "dark" ? "true" : undefined}>
        <div className="tp-lp-phone__status tp-lp-mono">
          <span>{f.clock}</span>
          <span className="tp-lp-phone__icons">
            {f.offline ? <WifiOff aria-hidden className="h-3 w-3" /> : <Wifi aria-hidden className="h-3 w-3" />}
            <BatteryIcon aria-hidden className="h-3 w-3" />
          </span>
        </div>

        {f.screen === "join" ? (
          <div className="tp-lp-join">
            <div className="tp-lp-kicker">{t("home.landing.demo.joinKicker")}</div>
            <div className="tp-lp-join__title">{t("home.landing.demo.joinTitle")}</div>
            <div>
              <div className="tp-lp-field-label">{t("home.landing.demo.sessionCode")}</div>
              <div className="tp-lp-code tp-lp-code--phone">
                {f.codeChars.map((c, i) => (
                  <span key={i} className="tp-lp-code__cell" data-shown="true">
                    {c.shown ? c.ch : ""}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <div className="tp-lp-field-label">{t("home.landing.demo.yourName")}</div>
              <div className="tp-lp-input" data-focused={f.nameFocused ? "true" : undefined}>
                {f.nameTyped}
                {f.nameFocused ? <span className="tp-lp-caret" /> : null}
              </div>
            </div>
            <div className="tp-lp-phone-btn" data-pressed={f.joinPressed ? "true" : undefined}>
              {t("home.landing.demo.startTask")}
            </div>
          </div>
        ) : null}

        {f.screen === "exam" ? (
          <div className="tp-lp-exam">
            <div className="tp-lp-exam__header">
              <div className="tp-lp-exam__title">{t("home.landing.demo.quizTitle")}</div>
              <div className="tp-lp-sync" data-kind={f.sync}>
                {f.sync === "syncing" ? (
                  <RefreshCw aria-hidden className="tp-lp-sync__spin h-3 w-3" />
                ) : (
                  <span className="tp-lp-sync__dot" />
                )}
                <span>
                  {f.sync === "saved"
                    ? t("home.exam.syncSaved")
                    : f.sync === "saving"
                      ? t("home.exam.syncSaving")
                      : f.sync === "reconnect"
                        ? t("home.exam.syncReconnect")
                        : t("home.landing.demo.syncing")}
                </span>
              </div>
              {f.queued > 0 ? (
                <div className="tp-lp-warn-pill tp-lp-warn-pill--sm">
                  <Smartphone aria-hidden className="h-3 w-3" />
                  {t("home.landing.demo.queued", { n: f.queued })}
                </div>
              ) : null}
              <div className="tp-lp-progress">
                <div className="tp-lp-progress__fill" style={{ width: f.allAnswered ? "100%" : "0%" }} />
              </div>
            </div>

            {f.restoredToast ? (
              <div className="tp-lp-toast">
                <RotateCcw aria-hidden className="h-3.5 w-3.5 flex-none" />
                {t("home.landing.demo.restored")}
              </div>
            ) : null}

            <div className="tp-lp-exam__body">
              <div className="tp-lp-qcard">
                <div className="tp-lp-qcard__meta">
                  <span>{t("home.landing.demo.questionMeta")}</span>
                  {f.questionSaved ? (
                    <span className="tp-lp-qcard__saved">
                      <Check aria-hidden className="h-3 w-3" />
                      {t("home.landing.demo.saved")}
                    </span>
                  ) : null}
                </div>
                <div className="tp-lp-qcard__prompt">{t("home.landing.demo.question")}</div>
                <div className="tp-lp-answer" data-focused={f.answerFocused ? "true" : undefined}>
                  {f.answerText}
                  {f.answerFocused ? <span className="tp-lp-caret tp-lp-caret--inline" /> : null}
                </div>
              </div>
              {f.feedbackVisible ? (
                <div className="tp-teacher-feedback-card tp-lp-feedback">
                  <div className="tp-lp-feedback__title">{t("home.landing.demo.feedbackTitle")}</div>
                  <div className="tp-lp-feedback__body">{t("home.landing.demo.feedbackBody")}</div>
                </div>
              ) : null}
              <div className="tp-lp-exam__footer">
                <div className="tp-lp-phone-btn" data-pressed={f.handInPressed ? "true" : undefined}>
                  {t("home.landing.demo.handIn")}
                </div>
                <div className="tp-lp-exam__hint">
                  {f.allAnswered ? t("home.landing.demo.allAnswered") : t("home.landing.demo.oneBlank")}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {f.screen === "dark" ? (
          <div className="tp-lp-dark">
            <BatteryWarning aria-hidden className="h-7 w-7" />
            {t("home.landing.demo.batteryDied")}
          </div>
        ) : null}

        {f.screen === "done" ? (
          <div className="tp-lp-done">
            <div className="tp-lp-done__ring">
              <Check aria-hidden className="h-7 w-7" />
            </div>
            <div className="tp-lp-done__title">{t("home.landing.demo.submittedTitle")}</div>
            <div className="tp-lp-done__body">{t("home.landing.demo.submittedBody")}</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
