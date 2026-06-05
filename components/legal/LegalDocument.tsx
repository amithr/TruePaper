import { LEGAL } from "@/lib/legal/constants";
import type { LegalDocumentContent } from "@/lib/legal/types";
import { LocaleLink } from "@/lib/i18n/client";
import { ui } from "@/lib/ui";

type Props = {
  content: LegalDocumentContent;
  backLabel: string;
  summaryLabel: string;
};

export function LegalDocument({ content, backLabel, summaryLabel }: Props) {
  return (
    <article className="mx-auto w-full max-w-3xl">
      <p className="mb-6">
        <LocaleLink href="/" className={`text-sm font-medium ${ui.link}`}>
          ← {backLabel}
        </LocaleLink>
      </p>
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-[var(--tp-text)] sm:text-4xl">
          {content.title}
        </h1>
        <p className="mt-2 text-sm text-[var(--tp-text-muted)]">
          {LEGAL.companyName} · {LEGAL.effectiveDate}
        </p>
        <div className="tp-legal-summary mt-6 rounded-[var(--tp-radius-sm)] border border-[var(--tp-border)] bg-[var(--tp-brand-soft)] px-5 py-4 text-[var(--tp-text-secondary)]">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--tp-brand-text)]">
            {summaryLabel}
          </p>
          <p className="mt-2 text-base leading-relaxed">{content.summary}</p>
        </div>
      </header>
      <div className="space-y-10">
        {content.sections.map((section) => (
          <section key={section.id} id={section.id} className="scroll-mt-8">
            <h2 className="text-xl font-semibold text-[var(--tp-text)]">{section.title}</h2>
            <div className="mt-3 space-y-3 text-base leading-relaxed text-[var(--tp-text-secondary)]">
              {section.paragraphs.map((paragraph, index) => (
                <p key={`${section.id}-${index}`}>{paragraph}</p>
              ))}
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}
