"use client";

import { ArrowRight, Check, CloudUpload, Plug, WifiOff } from "lucide-react";
import { useState, type FormEvent } from "react";

import { BrandMark } from "@/components/BrandMark";
import { LanguageToggle } from "@/components/LanguageToggle";
import { LandingDemo } from "@/components/landing/LandingDemo";
import { LocaleLink as Link, useLocaleRouter } from "@/lib/i18n/client";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import { isValidJoinCodeFormat, normalizeJoinCode } from "@/lib/join-code";
import { focusRing } from "@/lib/ui";

/**
 * Investor deck destination. Empty hides the button — set a URL (or mailto:) once
 * there is somewhere real to send investors.
 */
const INVESTOR_DECK_HREF = "";

/**
 * Guest marketing landing: offline-first resilience story with a scripted,
 * state-driven demo (`LandingDemo`). The demo is decorative; the reliability and
 * "how it works" sections carry the same story for scanners and assistive tech.
 */
export function LandingHero({
  teacherCtaHref = "/register",
  joinHref = "/join",
}: {
  teacherCtaHref?: string;
  joinHref?: string;
}) {
  const t = useTranslations();

  return (
    <div className="tp-lp">
      <header className="tp-lp-top">
        <BrandMark />
        <nav className="tp-lp-top__nav" aria-label={t("home.landing.navInvestors")}>
          <a href="#investors" className={`tp-btn-ghost tp-lp-top__link ${focusRing}`}>
            {t("home.landing.navInvestors")}
          </a>
          <Link href="/login" className={`tp-btn-secondary tp-lp-top__signin ${focusRing}`}>
            {t("common.signIn")}
          </Link>
          <LanguageToggle />
        </nav>
      </header>

      <section className="tp-lp-hero" aria-labelledby="tp-lp-headline">
        <div className="tp-lp-hero__copy">
          <span className="tp-lp-eyebrow">
            <WifiOff aria-hidden className="h-3 w-3" />
            {t("home.landing.eyebrow")}
          </span>
          <h1 id="tp-lp-headline" className="tp-lp-headline">
            {t("home.landing.headline")}
          </h1>
          <p className="tp-lp-sub">{t("home.landing.subheadline")}</p>
          <div className="tp-lp-ctas">
            <Link href={teacherCtaHref} className={`tp-btn-primary tp-lp-cta-primary ${focusRing}`}>
              {t("home.landing.teacherCta")}
            </Link>
            <a href="#join" className={`tp-btn-secondary tp-lp-cta-secondary ${focusRing}`}>
              {t("home.landing.studentCta")}
            </a>
          </div>
          <ul className="tp-lp-proof">
            {(["proofFree", "proofNoAccounts", "proofSetup"] as const).map((key) => (
              <li key={key}>
                <Check aria-hidden className="tp-lp-proof__check h-3.5 w-3.5" strokeWidth={2.5} />
                {t(`home.landing.${key}`)}
              </li>
            ))}
          </ul>
          <figure className="tp-lp-quote">
            <span aria-hidden className="tp-lp-quote__avatar">
              AP
            </span>
            <div>
              <blockquote>
                <p>&ldquo;{t("home.landing.proofQuote")}&rdquo;</p>
              </blockquote>
              <figcaption>{t("home.landing.proofQuoteAttribution")}</figcaption>
            </div>
          </figure>
        </div>

        <div className="tp-lp-hero__demo" role="img" aria-label={t("home.landing.demo.label")}>
          <LandingDemo />
        </div>
      </section>

      <section id="reliability" className="tp-lp-section" aria-labelledby="tp-lp-reliability">
        <div className="tp-lp-section__head">
          <span className="tp-lp-eyebrow">{t("home.landing.reliabilityEyebrow")}</span>
          <h2 id="tp-lp-reliability" className="tp-lp-h2">
            {t("home.landing.reliabilityTitle")}
          </h2>
        </div>
        <div className="tp-lp-cards">
          <ReliabilityCard
            tone="accent"
            icon={<WifiOff aria-hidden className="h-[19px] w-[19px]" />}
            title={t("home.landing.reliabilityWifiTitle")}
            body={t("home.landing.reliabilityWifiBody")}
          />
          <ReliabilityCard
            tone="amber"
            icon={<Plug aria-hidden className="h-[19px] w-[19px]" />}
            title={t("home.landing.reliabilityPowerTitle")}
            body={t("home.landing.reliabilityPowerBody")}
          />
          <ReliabilityCard
            tone="mint"
            icon={<CloudUpload aria-hidden className="h-[19px] w-[19px]" />}
            title={t("home.landing.reliabilityControlTitle")}
            body={t("home.landing.reliabilityControlBody")}
          />
        </div>
      </section>

      <section id="how" className="tp-lp-section tp-lp-how" aria-labelledby="tp-lp-how">
        <div>
          <h2 id="tp-lp-how" className="tp-lp-h2">
            {t("home.landing.howTitle")}
          </h2>
          <p className="tp-lp-section__sub">{t("home.landing.howSub")}</p>
        </div>
        <ol className="tp-lp-steps">
          {([1, 2, 3] as const).map((n) => (
            <li key={n}>
              <span className="tp-lp-steps__num">{n}</span>
              <span>
                <h3 className="tp-lp-h3">{t(`home.landing.howStep${n}Title`)}</h3>
                <p className="tp-lp-card__body">{t(`home.landing.howStep${n}Body`)}</p>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section id="investors" className="tp-lp-investors" aria-labelledby="tp-lp-investors">
        <div>
          <span className="tp-lp-investors__kicker">{t("home.landing.investorsKicker")}</span>
          <h2 id="tp-lp-investors" className="tp-lp-investors__title">
            {t("home.landing.investorsTitle")}
          </h2>
          <p className="tp-lp-investors__body">{t("home.landing.investorsBody")}</p>
          {INVESTOR_DECK_HREF ? (
            <a href={INVESTOR_DECK_HREF} className={`tp-lp-investors__cta ${focusRing}`}>
              {t("home.landing.investorsCta")}
              <ArrowRight aria-hidden className="h-4 w-4" />
            </a>
          ) : null}
        </div>
        <dl className="tp-lp-facts">
          {(
            [
              ["13", "factTypes"],
              ["2", "factLanguages"],
              ["≤ 3 s", "factResync"],
              ["0", "factAccounts"],
            ] as const
          ).map(([value, key]) => (
            <div key={key}>
              <dt className="tp-lp-facts__value">{value}</dt>
              <dd className="tp-lp-facts__label">{t(`home.landing.${key}`)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section id="start" className="tp-lp-final" aria-labelledby="tp-lp-final">
        <h2 id="tp-lp-final" className="tp-lp-final__title">
          {t("home.landing.footerCtaTitle")}
        </h2>
        <p className="tp-lp-final__sub">{t("home.landing.footerCtaSub")}</p>
        <div className="tp-lp-ctas tp-lp-ctas--center">
          <Link href={teacherCtaHref} className={`tp-btn-primary tp-lp-cta-primary ${focusRing}`}>
            {t("home.landing.teacherCta")}
          </Link>
          <a href="#join" className={`tp-btn-secondary tp-lp-cta-secondary ${focusRing}`}>
            {t("home.landing.footerCtaStudent")}
          </a>
        </div>
        <p className="tp-lp-final__fine">{t("home.landing.ctaFinePrint")}</p>
      </section>

      <StudentJoinCard joinHref={joinHref} />
    </div>
  );
}

function ReliabilityCard({
  tone,
  icon,
  title,
  body,
}: {
  tone: "accent" | "amber" | "mint";
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="tp-lp-card">
      <span className="tp-lp-card__icon" data-tone={tone}>
        {icon}
      </span>
      <h3 className="tp-lp-h3">{title}</h3>
      <p className="tp-lp-card__body">{body}</p>
    </div>
  );
}

function StudentJoinCard({ joinHref }: { joinHref: string }) {
  const t = useTranslations();
  const router = useLocaleRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const normalized = normalizeJoinCode(code);
    if (!isValidJoinCodeFormat(normalized)) {
      setError(t("home.validation.joinCode"));
      return;
    }
    setError("");
    router.push(`${joinHref}?code=${encodeURIComponent(normalized)}`);
  };

  return (
    <section id="join" className="tp-lp-join-card" aria-labelledby="tp-lp-join">
      <div className="tp-lp-join-card__head">
        <span className="tp-lp-kicker">{t("home.landing.joinKicker")}</span>
        <h2 id="tp-lp-join" className="tp-lp-join-card__title">
          {t("home.landing.joinTitle")}
        </h2>
      </div>
      <form className="tp-lp-join-card__form" onSubmit={submit} noValidate>
        <input
          type="text"
          inputMode="text"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={8}
          value={code}
          onChange={(event) => {
            setCode(event.target.value.toUpperCase());
            if (error) {
              setError("");
            }
          }}
          placeholder={t("home.landing.joinPlaceholder")}
          aria-label={t("home.landing.joinPlaceholder")}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "tp-lp-join-error" : "tp-lp-join-hint"}
          className="tp-input tp-lp-join-card__input"
          data-testid="landing-join-code"
        />
        <button type="submit" className={`tp-btn-primary ${focusRing}`}>
          {t("home.landing.joinButton")}
        </button>
      </form>
      {error ? (
        <p id="tp-lp-join-error" role="alert" className="tp-lp-join-card__error">
          {error}
        </p>
      ) : (
        <p id="tp-lp-join-hint" className="tp-lp-join-card__hint">
          {t("home.landing.joinHint")}
        </p>
      )}
    </section>
  );
}
