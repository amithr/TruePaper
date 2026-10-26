"use client";

import { BarChart3, ChevronLeft, ChevronRight, Eye, EyeOff, Maximize2, Minimize2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ExamMarkdown } from "@/components/ExamMarkdown";
import { FormAssetImage } from "@/components/FormAssetImage";
import { LoadingBar } from "@/components/LoadingBar";
import { ClassResultsPanel } from "@/components/review/ClassResultsPanel";
import { ReviewSlide } from "@/components/review/ReviewSlide";
import { deferEffect } from "@/lib/defer-effect";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import { LocaleLink } from "@/lib/i18n/client";
import { hasAutogradeKey } from "@/lib/response-types/autograde";
import { questionClassStats, studentsForReview } from "@/lib/review/class-stats";
import { fetchSessionExam, type SessionExamData } from "@/lib/review/fetch-session-exam";
import { useFullscreen } from "@/lib/use-fullscreen";
import { useInitialLoadRetry } from "@/lib/use-initial-load-retry";
import { usePresentationKeys } from "@/lib/use-presentation-keys";
import { focusRing } from "@/lib/ui";

type Props = {
  liveSessionId: string;
};

const ZOOM_KEY = "truepaper_review_zoom";
const ZOOM_MIN = 1;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.2;
const ZOOM_DEFAULT = 1.4;

function readZoom(): number {
  try {
    const raw = window.localStorage.getItem(ZOOM_KEY);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, n)) : ZOOM_DEFAULT;
  } catch {
    return ZOOM_DEFAULT;
  }
}

function readSlideFromHash(): number {
  const m = /^#q(\d+)$/.exec(window.location.hash);
  return m ? Math.max(0, Number(m[1])) : 0;
}

/**
 * Projector walkthrough of an exam: one blank question per slide, big type,
 * keyboard/clicker navigation, with per-question "Reveal answer" and
 * "Class results" (anonymous aggregates) the teacher flips on when ready.
 */
export function ClassReviewPresentation({ liveSessionId }: Props) {
  const t = useTranslations();
  const [data, setData] = useState<SessionExamData | null>(null);
  const [error, setError] = useState("");
  const [slide, setSlide] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [zoom, setZoom] = useState(ZOOM_DEFAULT);
  const fullscreen = useFullscreen();

  const load = useCallback(async () => {
    try {
      setData(await fetchSessionExam(liveSessionId));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("session.errors.load"));
    }
  }, [liveSessionId, t]);

  useEffect(() => {
    deferEffect(() => {
      setZoom(readZoom());
      setSlide(readSlideFromHash());
      void load();
    });
  }, [load]);

  const { slow } = useInitialLoadRetry(Boolean(data), () => void load());

  const questions = useMemo(() => data?.form.questions ?? [], [data]);
  const total = questions.length;
  const reviewStudents = useMemo(() => (data ? studentsForReview(data.students) : []), [data]);
  const finishedBased = useMemo(() => (data ? data.students.some((s) => s.finished) : false), [data]);
  const handedIn = useMemo(() => (data ? data.students.filter((s) => s.finished).length : 0), [data]);

  const go = useCallback(
    (next: number) => {
      const clamped = Math.min(total, Math.max(0, next));
      setSlide(clamped);
      setRevealed(false);
      setShowResults(false);
      window.history.replaceState(null, "", clamped === 0 ? window.location.pathname : `#q${clamped}`);
    },
    [total],
  );

  const question = slide > 0 ? questions[slide - 1] : null;
  const canReveal = question ? hasAutogradeKey(question) : false;

  usePresentationKeys(
    {
      next: () => go(slide + 1),
      prev: () => go(slide - 1),
      first: () => go(0),
      last: () => go(total),
      toggleAnswer: () => {
        if (canReveal) {
          setRevealed((v) => !v);
        }
      },
      toggleResults: () => {
        if (question) {
          setShowResults((v) => !v);
        }
      },
      toggleFullscreen: fullscreen.toggle,
    },
    Boolean(data),
  );

  const changeZoom = (delta: number) => {
    const next = Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom + delta)) * 10) / 10;
    setZoom(next);
    try {
      window.localStorage.setItem(ZOOM_KEY, String(next));
    } catch {
      /* per-device nicety */
    }
  };

  const exit = () => {
    if (window.opener && !window.opener.closed) {
      window.close();
    }
  };

  const stats = useMemo(
    () => (question && showResults ? questionClassStats(question, reviewStudents) : null),
    [question, showResults, reviewStudents],
  );

  if (!data) {
    return (
      <div className="tp-present">
        <main className="tp-present-stage">
          <div className="w-full max-w-md space-y-4 text-center">
            {error ? (
              <p className="tp-alert tp-alert-error" role="alert">
                {error}
              </p>
            ) : (
              <LoadingBar variant="dark" label={t("review.present.loading")} />
            )}
            {error || slow ? (
              <button type="button" className={`tp-present-btn ${focusRing}`} onClick={() => void load()}>
                {t("common.tryAgain")}
              </button>
            ) : null}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="tp-present" data-testid="class-review">
      <header className="tp-present-head">
        <div className="min-w-0">
          <p className="tp-present-eyebrow">{t("review.present.eyebrow")}</p>
          <h1 className="tp-present-title">{data.form.title}</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="tp-present-meta" data-testid="review-counter">
            {slide === 0
              ? `${t("review.present.questionsCount", { n: total })} · ${t("review.present.handedIn", { n: handedIn })}`
              : t("review.present.slideCounter", { n: slide, total })}
          </span>
          <LocaleLink
            href={`/dashboard/sessions/${liveSessionId}`}
            className={`tp-present-btn ${focusRing}`}
            onClick={exit}
            aria-label={t("review.present.exit")}
            title={t("review.present.exit")}
          >
            <X aria-hidden className="h-5 w-5" />
          </LocaleLink>
        </div>
      </header>

      <main className="tp-present-stage">
        <div className="tp-present-stage__inner" data-results={stats ? "true" : undefined}>
          <div className="tp-present-zoom" style={{ zoom }} data-testid="review-zoom">
            {slide === 0 ? (
              <div className="tp-present-slide tp-present-slide--title" data-testid="review-title-slide">
                <p className="tp-present-slide__eyebrow">{t("review.present.eyebrow")}</p>
                <h2 className="tp-present-slide__title">{data.form.title}</h2>
                <p className="tp-present-slide__intro">{t("review.present.intro")}</p>
                {data.form.description || data.form.descriptionImagePath ? (
                  <div className="tp-exam-intro mt-5">
                    <p className="tp-exam-intro__label">{t("home.exam.beforeYouStart")}</p>
                    {data.form.description ? (
                      <ExamMarkdown variant="body" className="tp-exam-intro__body">
                        {data.form.description}
                      </ExamMarkdown>
                    ) : null}
                    {data.form.descriptionImagePath ? (
                      <FormAssetImage
                        path={data.form.descriptionImagePath}
                        alt={t("home.exam.descriptionImageAlt")}
                        className="mt-3 overflow-hidden rounded-[12px] border border-[var(--tp-border)] bg-white"
                      />
                    ) : null}
                  </div>
                ) : null}
                {total === 0 ? <p className="mt-5 text-[var(--tp-text-secondary)]">{t("review.present.noQuestions")}</p> : null}
                <p className="tp-present-slide__keys">{t("review.present.keysHint")}</p>
              </div>
            ) : question ? (
              <ReviewSlide question={question} index={slide - 1} revealed={revealed} />
            ) : null}
          </div>
          {stats ? <ClassResultsPanel stats={stats} finishedBased={finishedBased} /> : null}
        </div>
      </main>

      <nav className="tp-present-bar" aria-label={t("review.present.title")}>
        <div className="tp-present-bar__group">
          <button type="button" className={`tp-present-btn ${focusRing}`} disabled={slide === 0} onClick={() => go(slide - 1)} data-testid="review-prev">
            <ChevronLeft aria-hidden className="h-5 w-5" />
            <span className="hidden sm:inline">{t("review.present.prev")}</span>
          </button>
          <div className="tp-present-dots" role="group">
            {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                className="tp-present-dot"
                data-active={n === slide ? "true" : undefined}
                aria-label={t("review.present.jumpTo", { n })}
                aria-current={n === slide ? "step" : undefined}
                onClick={() => go(n)}
              >
                {n}
              </button>
            ))}
          </div>
          <button type="button" className={`tp-present-btn tp-present-btn--primary ${focusRing}`} disabled={slide >= total} onClick={() => go(slide + 1)} data-testid="review-next">
            <span className="hidden sm:inline">{t("review.present.next")}</span>
            <ChevronRight aria-hidden className="h-5 w-5" />
          </button>
        </div>

        <div className="tp-present-bar__group">
          {question ? (
            <>
              <button
                type="button"
                className={`tp-present-btn ${focusRing}`}
                disabled={!canReveal}
                aria-pressed={revealed}
                title={canReveal ? undefined : t("review.present.noKey")}
                onClick={() => setRevealed((v) => !v)}
                data-testid="review-reveal"
              >
                {revealed ? <EyeOff aria-hidden className="h-5 w-5" /> : <Eye aria-hidden className="h-5 w-5" />}
                <span className="hidden md:inline">{revealed ? t("review.present.hideAnswer") : t("review.present.revealAnswer")}</span>
              </button>
              <button
                type="button"
                className={`tp-present-btn ${focusRing}`}
                aria-pressed={showResults}
                onClick={() => setShowResults((v) => !v)}
                data-testid="review-results-toggle"
              >
                <BarChart3 aria-hidden className="h-5 w-5" />
                <span className="hidden md:inline">{showResults ? t("review.present.hideResults") : t("review.present.classResults")}</span>
              </button>
            </>
          ) : null}
          <button type="button" className={`tp-present-btn ${focusRing}`} disabled={zoom <= ZOOM_MIN} onClick={() => changeZoom(-ZOOM_STEP)} aria-label={t("review.present.textSmaller")} title={t("review.present.textSmaller")} data-testid="review-zoom-out">
            A−
          </button>
          <button type="button" className={`tp-present-btn ${focusRing}`} disabled={zoom >= ZOOM_MAX} onClick={() => changeZoom(ZOOM_STEP)} aria-label={t("review.present.textBigger")} title={t("review.present.textBigger")} data-testid="review-zoom-in">
            A+
          </button>
          {fullscreen.supported ? (
            <button type="button" className={`tp-present-btn ${focusRing}`} onClick={fullscreen.toggle} aria-label={fullscreen.active ? t("review.present.exitFullscreen") : t("review.present.fullscreen")} title={fullscreen.active ? t("review.present.exitFullscreen") : t("review.present.fullscreen")}>
              {fullscreen.active ? <Minimize2 aria-hidden className="h-5 w-5" /> : <Maximize2 aria-hidden className="h-5 w-5" />}
            </button>
          ) : null}
        </div>
      </nav>
    </div>
  );
}
