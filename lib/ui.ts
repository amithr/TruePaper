/** Lowercase words that stay lowercase mid-label (articles & light conjunctions). */
const BUTTON_LABEL_LOWERCASE = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "for",
  "nor",
  "on",
  "at",
  "to",
  "from",
  "by",
  "in",
  "of",
  "as",
]);

/** Title-style labels for buttons (e.g. "Add option" → "Add Option"). */
export function buttonLabel(text: string): string {
  let wordIndex = 0;
  return text.replace(/\S+/g, (word) => {
    const trailing = word.match(/^(.+?)([.,…!?]*)$/) ?? null;
    const core = trailing ? trailing[1] : word;
    const punct = trailing ? trailing[2] : "";
    const lower = core.toLowerCase();
    const formatted =
      wordIndex > 0 && BUTTON_LABEL_LOWERCASE.has(lower)
        ? lower
        : core.charAt(0).toUpperCase() + core.slice(1).toLowerCase();
    wordIndex += 1;
    return formatted + punct;
  });
}

/** Shared soft-dashboard UI class strings (see app/globals.css). */
export const focusRing =
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tp-accent-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--tp-bg)]";

export const ui = {
  page: "min-h-screen bg-[var(--tp-bg)] text-[var(--tp-text)] antialiased",
  pageMain: "mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10",
  pageMainNarrow: "mx-auto w-full max-w-md px-4 py-12 sm:px-6",
  card: "tp-card",
  cardPadded: "tp-card p-6 sm:p-8",
  questionCard: "tp-question-card",
  questionCardNested: "tp-question-card tp-question-card--nested",
  questionList: "tp-question-list",
  cardHeader: "tp-card-header",
  sectionTitle: "tp-section-title",
  label: "tp-label",
  questionScoring: "tp-question-scoring",
  pointsInput: "tp-points-input",
  input: "tp-input",
  textarea: "tp-input min-h-[5rem] resize-y",
  select: "tp-input",
  btnPrimary: `tp-btn-primary ${focusRing}`,
  btnSecondary: `tp-btn-secondary ${focusRing}`,
  btnGhost: `tp-btn-ghost ${focusRing}`,
  btnDanger: `tp-btn-danger ${focusRing}`,
  link: `tp-link ${focusRing}`,
  pill: "tp-pill",
  pillActive: "tp-pill tp-pill-active",
  cardInteractive: "tp-card tp-card-interactive",
  cardAccent: "tp-card-accent",
  softPanel: "tp-soft-panel",
  empty: "tp-empty",
  entityListPanel: "tp-entity-list-panel",
  entityList: "tp-entity-list",
  entityListRow: "tp-entity-list-row",
  entityListRowPrimary: "tp-entity-list-row__primary",
  entityListRowTitle: "tp-entity-list-row__title",
  entityListRowMeta: "tp-entity-list-row__meta",
  entityListRowActions: "tp-entity-list-row__actions",
  entityListInput: "tp-entity-list-input",
  alertError: "tp-alert tp-alert-error",
  alertSuccess: "tp-alert tp-alert-success",
  alertWarning: "tp-alert tp-alert-warning",
  statValue: "tp-stat-value",
  statLabel: "tp-stat-label",
  badgeSuccess: "tp-badge tp-badge-success",
  badgeDanger: "tp-badge tp-badge-danger",
  divider: "divide-y divide-[var(--tp-border)]",
} as const;
