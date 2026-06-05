"use client";

import { LocaleLink as Link } from "@/lib/i18n/client";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import { focusRing } from "@/lib/ui";

export type Crumb = {
  label: string;
  /** Omit on the current (last) page so it renders as plain text. */
  href?: string;
};

function BackArrowIcon() {
  return (
    <svg
      aria-hidden
      className="h-4 w-4 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}

function SeparatorIcon() {
  return (
    <svg
      aria-hidden
      className="h-3.5 w-3.5 shrink-0 text-[var(--tp-text-muted)]"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

/**
 * Hierarchical navigation that replaces ad-hoc "← Back" links. Shows the full
 * path on tablets/desktops (with each ancestor clickable) and collapses to a
 * single compact "← parent" affordance on phones.
 */
export function Breadcrumbs({
  items,
  className = "",
}: {
  items: Crumb[];
  className?: string;
}) {
  const t = useTranslations();
  const trail = items.filter((crumb) => crumb.label.trim().length > 0);
  if (trail.length === 0) {
    return null;
  }

  // Closest linkable ancestor — powers the compact mobile back button.
  let parent: Crumb | null = null;
  for (let i = trail.length - 2; i >= 0; i -= 1) {
    if (trail[i].href) {
      parent = trail[i];
      break;
    }
  }

  return (
    <nav aria-label={t("nav.breadcrumbAria")} className={className}>
      {parent ? (
        <Link
          href={parent.href as string}
          className={`inline-flex max-w-[80vw] items-center gap-1.5 text-sm font-medium text-[var(--tp-text-secondary)] transition-colors hover:text-[var(--tp-text)] sm:hidden ${focusRing}`}
        >
          <BackArrowIcon />
          <span className="truncate">{parent.label}</span>
        </Link>
      ) : null}

      <ol className="hidden flex-wrap items-center gap-1.5 text-sm sm:flex">
        {trail.map((crumb, index) => {
          const isLast = index === trail.length - 1;
          return (
            <li key={`${crumb.label}-${index}`} className="inline-flex items-center gap-1.5">
              {crumb.href && !isLast ? (
                <Link
                  href={crumb.href}
                  className={`rounded-sm text-[var(--tp-text-secondary)] transition-colors hover:text-[var(--tp-text)] hover:underline ${focusRing}`}
                >
                  {crumb.label}
                </Link>
              ) : (
                <span
                  aria-current={isLast ? "page" : undefined}
                  className={`inline-block max-w-[20rem] truncate align-bottom ${
                    isLast
                      ? "font-semibold text-[var(--tp-text)]"
                      : "text-[var(--tp-text-secondary)]"
                  }`}
                >
                  {crumb.label}
                </span>
              )}
              {!isLast ? <SeparatorIcon /> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
