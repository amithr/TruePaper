"use client";

import { LocaleLink as Link } from "@/lib/i18n/client";
import { useTranslations } from "@/lib/i18n/I18nProvider";

/**
 * Guest marketing landing: product theater + conversion copy (proof, steps, CTAs).
 * The animated stage is decorative; the visible "How it works" steps carry the
 * same story for scanners and assistive tech.
 */
export function LandingHero({
  teacherCtaHref = "/register",
  joinHref = "/join",
}: {
  teacherCtaHref?: string;
  joinHref?: string;
}) {
  const t = useTranslations();
  const answer = t("home.landing.stage.answerText");

  return (
    <div className="tp-lp-wrap">
      <section className="tp-lp tp-anim-fade-up" aria-label={t("home.landing.headline")}>
        <div className="tp-lp__topbar">
          <span className="tp-lp__wordmark">
            <span aria-hidden className="tp-brand-mark">
              T
            </span>
            TruePaper
          </span>
        </div>

        <div className="tp-lp__grid">
          <div className="tp-lp__copy">
            <span className="tp-lp__eyebrow">{t("home.landing.eyebrow")}</span>
            <h1 className="tp-lp__headline">{t("home.landing.headline")}</h1>
            <p className="tp-lp__sub">{t("home.landing.subheadline")}</p>

            <div className="tp-lp__cta">
              <Link href={teacherCtaHref} className="tp-btn-primary tp-lp__cta-primary">
                {t("home.landing.teacherCta")}
              </Link>
              <p className="tp-lp__cta-fine">{t("home.landing.ctaFinePrint")}</p>
            </div>

            <ul className="tp-lp__trust">
              <li>
                <CheckDot />
                {t("home.landing.trustSetup")}
              </li>
              <li>
                <CheckDot />
                {t("home.landing.trustDevices")}
              </li>
              <li>
                <CheckDot />
                {t("home.landing.trustPrivacy")}
              </li>
              <li>
                <CheckDot />
                {t("home.landing.trustNoPaste")}
              </li>
            </ul>

            <p className="tp-lp__student-link">
              <Link href={joinHref} className="tp-link">
                {t("home.landing.studentLink")}
              </Link>
            </p>

            <div className="tp-lp__proof">
              <p className="tp-lp__proof-stat">{t("home.landing.proofStat")}</p>
              <blockquote className="tp-lp__proof-quote">
                <p>&ldquo;{t("home.landing.proofQuote")}&rdquo;</p>
                <footer>— {t("home.landing.proofQuoteAttribution")}</footer>
              </blockquote>
            </div>
          </div>

          <div className="tp-lp__stage" aria-hidden="true">
            <div className="tp-lp-scene">
              <div className="tp-lp-teacher">
                <div className="tp-lp-teacher__bar">
                  <span className="tp-lp-dot" />
                  <span className="tp-lp-dot" />
                  <span className="tp-lp-dot" />
                </div>
                <div className="tp-lp-teacher__body">
                  <div className="tp-lp-sessioncard">
                    <span className="tp-lp-sessioncard__label">
                      {t("home.landing.stage.liveLabel")}
                    </span>
                    <div className="tp-lp-code">
                      {"MIT204".split("").map((ch, i) => (
                        <span key={i}>{ch}</span>
                      ))}
                    </div>
                    <div className="tp-lp-sessioncard__meta">
                      <span className="tp-lp-qr" aria-hidden="true">
                        {Array.from({ length: 9 }).map((_, i) => (
                          <span key={i} />
                        ))}
                      </span>
                      <span className="tp-lp-timer">
                        44<span className="tp-lp-timer__colon">:</span>58
                      </span>
                    </div>
                  </div>

                  <ul className="tp-lp-roster">
                    <li className="tp-lp-rrow tp-lp-rrow--a">
                      <span className="tp-lp-rrow__avatar tp-lp-rrow__avatar--a">A</span>
                      <span className="tp-lp-rrow__main">
                        <span className="tp-lp-rrow__name">
                          {t("home.landing.stage.rosterAva")}
                        </span>
                        <span className="tp-lp-rrow__preview">
                          <span className="tp-lp-type tp-lp-type--mirror">{answer}</span>
                        </span>
                      </span>
                      <span className="tp-lp-rrow__status">
                        <span className="tp-status tp-status-typing tp-lp-pill-typing">
                          <span className="tp-status-dot" aria-hidden />
                          {t("session.status.typingLive")}
                        </span>
                        <span className="tp-status tp-status-graded tp-lp-pill-graded">
                          <span className="tp-status-dot" aria-hidden />
                          {t("session.status.gradedPill")}
                        </span>
                      </span>
                    </li>

                    <li className="tp-lp-rrow tp-lp-rrow--b">
                      <span className="tp-lp-rrow__avatar tp-lp-rrow__avatar--b">L</span>
                      <span className="tp-lp-rrow__main">
                        <span className="tp-lp-rrow__name">
                          {t("home.landing.stage.rosterLiam")}
                        </span>
                        <span className="tp-lp-rrow__bar" />
                      </span>
                      <span className="tp-lp-rrow__ring" aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="22" height="22">
                          <circle className="tp-lp-rrow__ring-track" cx="12" cy="12" r="9" />
                          <circle className="tp-lp-rrow__ring-fill" cx="12" cy="12" r="9" />
                        </svg>
                      </span>
                    </li>

                    <li className="tp-lp-rrow tp-lp-rrow--c">
                      <span className="tp-lp-rrow__avatar tp-lp-rrow__avatar--c">N</span>
                      <span className="tp-lp-rrow__main">
                        <span className="tp-lp-rrow__name">
                          {t("home.landing.stage.rosterNoah")}
                        </span>
                        <span className="tp-lp-rrow__bar tp-lp-rrow__bar--full" />
                      </span>
                      <span className="tp-status tp-status-finished">
                        <span className="tp-status-dot" aria-hidden />
                        {t("session.status.submittedPill")}
                      </span>
                    </li>
                  </ul>
                </div>
              </div>

              <div className="tp-lp-phone">
                <span className="tp-lp-phone__notch" />
                <div className="tp-lp-phone__screen">
                  <div className="tp-lp-join">
                    <span className="tp-lp-join__hint">{t("home.landing.stage.joinHint")}</span>
                    <div className="tp-lp-join__cells">
                      {"MIT204".split("").map((ch, i) => (
                        <span key={i}>{ch}</span>
                      ))}
                    </div>
                    <div className="tp-lp-join__name">
                      <span className="tp-lp-type tp-lp-type--name">
                        {t("home.landing.stage.joinName")}
                      </span>
                    </div>
                    <span className="tp-lp-join__btn">{t("home.join.startTask")}</span>
                  </div>

                  <div className="tp-lp-exam">
                    <div className="tp-lp-exam__progress">
                      <span className="tp-lp-exam__progress-fill" />
                    </div>
                    <article className="tp-lp-card">
                      <p className="tp-lp-card__prompt">
                        1. {t("home.landing.stage.questionPrompt")}
                        <span className="tp-lp-answered tp-answered-badge">
                          <svg
                            aria-hidden
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M5 12l5 5L20 7" />
                          </svg>
                          {t("home.exam.answered")}
                        </span>
                      </p>
                      <ul className="tp-lp-choices">
                        <li className="tp-lp-choice tp-lp-choice--pick">
                          <span className="tp-lp-radio" />
                          {t("home.landing.stage.optionA")}
                        </li>
                        <li className="tp-lp-choice">
                          <span className="tp-lp-radio" />
                          {t("home.landing.stage.optionB")}
                        </li>
                        <li className="tp-lp-choice">
                          <span className="tp-lp-radio" />
                          {t("home.landing.stage.optionC")}
                        </li>
                      </ul>
                    <div className="tp-lp-answer">
                      <span className="tp-lp-type tp-lp-type--answer">{answer}</span>
                      <span className="tp-lp-paste-toast" role="presentation">
                        {t("home.landing.stage.pasteBlocked")}
                      </span>
                      <span className="tp-lp-save">
                          <span className="tp-lp-save__dot" />
                          <span className="tp-lp-save__saving">
                            {t("home.landing.stage.saving")}
                          </span>
                          <span className="tp-lp-save__saved">
                            {t("home.landing.stage.saved")}
                          </span>
                        </span>
                      </div>
                      <div className="tp-lp-feedback">
                        <span className="tp-lp-feedback__label">
                          {t("home.landing.stage.feedbackLabel")}
                        </span>
                        <p>{t("home.landing.stage.feedbackText")}</p>
                      </div>
                      <div className="tp-lp-meta">
                        <span className="tp-exam-q-badge tp-exam-q-badge--points">
                          {t("home.exam.questionPts", { n: 5 })}
                        </span>
                        <span className="tp-exam-q-badge tp-exam-q-badge--type">
                          {t("home.exam.written")}
                        </span>
                        <span className="tp-exam-q-badge tp-exam-q-badge--feature">
                          {t("home.exam.liveFeedbackOn")}
                        </span>
                      </div>
                    </article>
                  </div>

                  <div className="tp-lp-done">
                    <div className="tp-lp-done__ring">
                      <svg viewBox="0 0 64 64" width="68" height="68">
                        <circle className="tp-lp-done__track" cx="32" cy="32" r="27" />
                        <circle className="tp-lp-done__fill" cx="32" cy="32" r="27" />
                      </svg>
                      <span className="tp-lp-done__pct">90%</span>
                    </div>
                    <span className="tp-lp-done__label">
                      {t("home.landing.stage.submitted")}
                    </span>
                  </div>
                </div>
              </div>

              <span className="tp-lp-chip">MIT204</span>
            </div>

            <div className="tp-lp-captions" aria-hidden="true">
              <span className="tp-lp-cap tp-lp-cap--1">{t("home.landing.captions.share")}</span>
              <span className="tp-lp-cap tp-lp-cap--2">{t("home.landing.captions.join")}</span>
              <span className="tp-lp-cap tp-lp-cap--3">{t("home.landing.captions.write")}</span>
              <span className="tp-lp-cap tp-lp-cap--4">{t("home.landing.captions.nudge")}</span>
              <span className="tp-lp-cap tp-lp-cap--5">{t("home.landing.captions.grade")}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="tp-lp__steps" aria-labelledby="tp-lp-steps-title">
        <h2 id="tp-lp-steps-title" className="tp-lp__steps-title">
          {t("home.landing.howItWorksTitle")}
        </h2>
        <ol className="tp-lp__steps-grid">
          <li>
            <span className="tp-lp__step-num" aria-hidden>
              1
            </span>
            <h3 className="tp-lp__step-title">{t("home.landing.howItWorksStep1Title")}</h3>
            <p className="tp-lp__step-body">{t("home.landing.howItWorksStep1Body")}</p>
          </li>
          <li>
            <span className="tp-lp__step-num" aria-hidden>
              2
            </span>
            <h3 className="tp-lp__step-title">{t("home.landing.howItWorksStep2Title")}</h3>
            <p className="tp-lp__step-body">{t("home.landing.howItWorksStep2Body")}</p>
          </li>
          <li>
            <span className="tp-lp__step-num" aria-hidden>
              3
            </span>
            <h3 className="tp-lp__step-title">{t("home.landing.howItWorksStep3Title")}</h3>
            <p className="tp-lp__step-body">{t("home.landing.howItWorksStep3Body")}</p>
          </li>
        </ol>
      </section>

      <section className="tp-lp__footer-cta" aria-labelledby="tp-lp-footer-cta-title">
        <h2 id="tp-lp-footer-cta-title" className="tp-lp__footer-cta-title">
          {t("home.landing.footerCtaTitle")}
        </h2>
        <p className="tp-lp__footer-cta-sub">{t("home.landing.footerCtaSub")}</p>
        <Link href={teacherCtaHref} className="tp-btn-primary tp-lp__cta-primary">
          {t("home.landing.teacherCta")}
        </Link>
        <p className="tp-lp__footer-cta-fine">{t("home.landing.ctaFinePrint")}</p>
      </section>
    </div>
  );
}

function CheckDot() {
  return (
    <svg
      className="tp-lp__check"
      viewBox="0 0 20 20"
      width="16"
      height="16"
      aria-hidden="true"
    >
      <circle cx="10" cy="10" r="9" fill="var(--tp-mint-soft)" />
      <path
        d="M6 10.5l2.5 2.5L14 7"
        fill="none"
        stroke="var(--tp-mint)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
