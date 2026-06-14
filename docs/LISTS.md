# List UI — design system

**Audience:** developers and agents building teacher-facing collection views in Truepaper.

This doc defines the **flat entity list** pattern used across the dashboard and live-session surfaces. Read it before adding or restyling a list of forms, sessions, roster rows, or similar.

---

## Principles

1. **One outer card** — The section uses `tp-card p-6`. Lists inside do not add a second bordered panel.
2. **Hairline row dividers** — Rows are separated by `border-bottom` only. No nested card borders or `space-y` card stacks.
3. **Flat controls** — Inputs, search fields, and segmented controls use `var(--tp-bg-subtle)` fills instead of outlines.
4. **Ghost secondary actions** — Edit, overflow (⋯), and row-level secondary buttons are borderless until hover.
5. **Uniform row height** — Desktop rows use a fixed min-height; content does not wrap inside segmented controls (`white-space: nowrap`).
6. **Column headers, not row labels** — On wide screens, uppercase column headers replace per-row field labels (labels stay visible on mobile).
7. **Hints live in the toolbar** — `HelpHint` icons belong in the list toolbar or section header, never inline on the first row (keeps rows identical).

---

## CSS classes

| Class | Role |
|-------|------|
| `tp-entity-list-panel` | Inner list wrapper (transparent, no border) |
| `tp-entity-list-toolbar` | Search + optional hints above the list |
| `tp-entity-list-search` / `__input` | Flat search field |
| `tp-entity-list-columns` | Desktop column header row |
| `tp-entity-list-columns--three` | 3-column grid (form library) |
| `tp-entity-list-columns--five` | 5-column grid (past sessions) |
| `tp-entity-list` | `<ul>` container |
| `tp-entity-list-row` | Single item row |
| `tp-entity-list-row--interactive` | Clickable row (cursor, keyboard focus) |
| `tp-entity-list-row--form` | Form library 3-column grid |
| `tp-entity-list-row--past` | Past sessions 5-column grid |
| `tp-entity-list-row--stacked` | Running sessions: primary + actions columns |
| `tp-entity-list-row__primary` | Title / identity column |
| `tp-entity-list-row__avatar` | Monogram avatar (forms) |
| `tp-entity-list-row__heading` | Title + meta wrapper |
| `tp-entity-list-row__title` | Primary link or label |
| `tp-entity-list-row__meta` | Secondary inline metadata |
| `tp-entity-list-row__content` | Middle column(s) or stacked body |
| `tp-entity-list-row__cell` | Tabular cell in `--past` rows |
| `tp-entity-list-row__actions` | Trailing action buttons |
| `tp-entity-list-footer` / `__pager` | Pagination bar |
| `tp-entity-list-empty` | Empty / no-results message |
| `tp-entity-list-input` | Flat inline input (duration, filters) |
| `tp-entity-list-segments` / `__segment` | Flat segmented control |
| `tp-entity-list-callout` | In-row alert (e.g. suspended students) |
| `tp-entity-list-nested` | Sub-list inside a row |

Form-specific setup still uses `tp-form-library-setup*` and `tp-form-library-segment*`.

---

## React components

Import from `@/components/lists/EntityList`:

| Component | Maps to |
|-----------|---------|
| `EntityListPanel` | `.tp-entity-list-panel` |
| `EntityListToolbar` | `.tp-entity-list-toolbar` |
| `EntityListSearch` | Flat search with icon |
| `EntityListColumns` | Column headers (`variant="three"` \| `"five"`) |
| `EntityList` | `<ul class="tp-entity-list">` |
| `EntityListRow` | `<li class="tp-entity-list-row">` |
| `EntityListFooter` | Pagination wrapper |
| `EntityListPager` | Button group |

`lib/ui.ts` exports shorthand class strings under `ui.entityList*`.

---

## Where this applies

| Surface | File | Row variant |
|---------|------|-------------|
| Form library | `DashboardFormLibrary.tsx`, `FormLibraryRow.tsx` | `--form` |
| Running sessions | `DashboardRunningSessions.tsx` | `--stacked` |
| Past sessions | `DashboardPastSessions.tsx` | `--past` |
| Live roster | `SessionExamRoster.tsx` | Roster uses flat `--flat` modifier on `tp-roster-list` |

### Intentionally different patterns

| Pattern | When to use |
|---------|-------------|
| `tp-question-list` | Builder, student exam, grading — one card per question |
| `tp-template-card` grid | Template library browse — grid of catalog cards |
| `tp-exam-choices` | Multiple-choice options inside a question |
| Marketing / auth lists | Landing, legal, registration — bespoke layout OK |

Do **not** force entity lists onto question stacks or catalog grids.

---

## Adding a new entity list

1. Wrap content in `section.tp-card.p-6` with a section title.
2. Use `EntityListPanel` → optional `EntityListToolbar` / `EntityListSearch` → optional `EntityListColumns` → `EntityList` → `EntityListRow` rows → optional `EntityListFooter`.
3. Pick a row variant class or add a new `--modifier` in `app/globals.css` if the column layout is genuinely new.
4. Put `HelpHint` in the toolbar, not on row 0.
5. Use `tp-entity-list-input` / `tp-entity-list-segments` for inline controls.
6. Add i18n column header keys; update `docs/FEATURES.md` if the list is a new user-facing surface.

---

## Related

- Styles: `app/globals.css` (search `tp-entity-list`)
- Tooltips on controls: `components/HoverTooltip.tsx`
- Onboarding hints: `components/HelpHint.tsx` (toolbar/header only for lists)
