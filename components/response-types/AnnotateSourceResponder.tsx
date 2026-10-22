"use client";

import { Highlighter, Trash2 } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import type { AnnotateSourceConfig, HighlightSpan } from "@/lib/response-types/types";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import { focusRing } from "@/lib/ui";

type Props = {
  passageId: string;
  highlights: HighlightSpan[];
  disabled: boolean;
  config: AnnotateSourceConfig;
  onChange: (highlights: HighlightSpan[]) => void;
};

type Range = { start: number; end: number };

function newHighlightId(): string {
  return `h-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Character offsets of the current selection inside `container`, or null. */
function selectionOffsets(container: HTMLElement | null): Range | null {
  const selection = typeof window !== "undefined" ? window.getSelection() : null;
  if (!container || !selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }
  const range = selection.getRangeAt(0);
  if (!container.contains(range.startContainer) || !container.contains(range.endContainer)) {
    return null;
  }
  const before = document.createRange();
  before.selectNodeContents(container);
  before.setEnd(range.startContainer, range.startOffset);
  const start = before.toString().length;
  const end = start + range.toString().length;
  return end > start ? { start, end } : null;
}

/**
 * Add a highlight, merging any it overlaps (notes are kept, joined) so spans never
 * overlap — overlapping spans can't be rendered as nested marks without scrambling text.
 */
export function addHighlight(highlights: HighlightSpan[], next: Range, passage: string): HighlightSpan[] {
  // Trim surrounding whitespace so "drag a little too far" doesn't grab spaces.
  let { start, end } = next;
  while (start < end && /\s/.test(passage[start] ?? "")) start += 1;
  while (end > start && /\s/.test(passage[end - 1] ?? "")) end -= 1;
  if (end <= start) {
    return highlights;
  }
  const overlapping = highlights.filter((h) => h.start < end && h.end > start);
  const kept = highlights.filter((h) => !(h.start < end && h.end > start));
  const notes = overlapping.map((h) => h.note?.trim()).filter((n): n is string => Boolean(n));
  const merged: HighlightSpan = {
    id: overlapping[0]?.id ?? newHighlightId(),
    start: Math.min(start, ...overlapping.map((h) => h.start)),
    end: Math.max(end, ...overlapping.map((h) => h.end)),
    ...(notes.length > 0 ? { note: notes.join(" · ") } : {}),
  };
  return [...kept, merged].sort((a, b) => a.start - b.start);
}

export function AnnotateSourceResponder({
  passageId,
  highlights,
  disabled,
  config,
  onChange,
}: Props) {
  const t = useTranslations();
  const passageRef = useRef<HTMLDivElement>(null);
  /** Last selection inside the passage — kept because tapping a button can clear it on touch. */
  const [selected, setSelected] = useState<Range | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");

  const hasPassage = Boolean(config.passageText?.trim());
  const passage = hasPassage ? config.passageText : t("responseTypes.annotateSource.emptyPassage");
  const editing = highlights.find((h) => h.id === editingId) ?? null;

  useEffect(() => {
    if (disabled || !hasPassage) {
      return;
    }
    const onSelectionChange = () => {
      const offsets = selectionOffsets(passageRef.current);
      // Only update while the selection is inside the passage; a tap on the button
      // that collapses it must not wipe what the student selected.
      if (offsets) {
        setSelected(offsets);
      }
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, [disabled, hasPassage]);

  const commitHighlight = useCallback(
    (range: Range | null) => {
      if (disabled || !hasPassage || !range) {
        return;
      }
      onChange(addHighlight(highlights, range, passage));
      setSelected(null);
      window.getSelection()?.removeAllRanges();
    },
    [disabled, hasPassage, highlights, onChange, passage],
  );

  // Mouse: highlight as soon as the drag ends. Touch/pen: the student adjusts the
  // selection handles, then taps "Highlight selection".
  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse") {
      commitHighlight(selectionOffsets(passageRef.current));
    }
  };

  const openEditor = (span: HighlightSpan) => {
    if (disabled) {
      return;
    }
    setEditingId(span.id);
    setNoteDraft(span.note ?? "");
  };

  const closeEditor = () => {
    setEditingId(null);
    setNoteDraft("");
  };

  const saveNote = () => {
    if (!editing) {
      return;
    }
    const note = noteDraft.trim();
    onChange(
      highlights.map((span) => {
        if (span.id !== editing.id) {
          return span;
        }
        const next: HighlightSpan = { id: span.id, start: span.start, end: span.end };
        return note ? { ...next, note } : next;
      }),
    );
    closeEditor();
  };

  const removeHighlight = () => {
    if (!editing) {
      return;
    }
    onChange(highlights.filter((span) => span.id !== editing.id));
    closeEditor();
  };

  const noteNumbers = new Map(
    [...highlights]
      .sort((a, b) => a.start - b.start)
      .filter((h) => h.note)
      .map((h, i) => [h.id, i + 1]),
  );

  const renderPassage = () => {
    if (!hasPassage || highlights.length === 0) {
      return passage;
    }
    const sorted = [...highlights].sort((a, b) => a.start - b.start);
    const chunks: ReactNode[] = [];
    let cursor = 0;
    for (const span of sorted) {
      const start = Math.max(span.start, cursor);
      if (span.end <= start) {
        continue; // defensive: skip overlaps from older answers
      }
      if (start > cursor) {
        chunks.push(passage.slice(cursor, start));
      }
      const noteNumber = noteNumbers.get(span.id);
      chunks.push(
        <mark
          key={span.id}
          className="tp-annotate-highlight"
          data-active={span.id === editingId ? "true" : undefined}
          // Note number via CSS ::after, not a DOM node: selection offsets are computed
          // from the passage's text content, which a <sup> would shift.
          data-note={noteNumber ? String(noteNumber) : undefined}
          data-testid="annotate-highlight"
          {...(disabled
            ? {}
            : {
                role: "button",
                tabIndex: 0,
                "aria-label": t("responseTypes.annotateSource.editHighlightAria", {
                  text: passage.slice(start, span.end).slice(0, 60),
                }),
                onClick: () => openEditor(span),
                onKeyDown: (event: React.KeyboardEvent) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openEditor(span);
                  }
                },
              })}
        >
          {passage.slice(start, span.end)}
        </mark>,
      );
      cursor = span.end;
    }
    if (cursor < passage.length) {
      chunks.push(passage.slice(cursor));
    }
    return chunks;
  };

  return (
    <div className="space-y-3" data-testid="student-annotate">
      {!disabled && hasPassage ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!selected}
            // Keep the selection alive on desktop: don't let the button steal it on press.
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => commitHighlight(selected)}
            className={`tp-btn-secondary inline-flex min-h-11 items-center gap-2 px-4 text-sm ${focusRing} disabled:opacity-50`}
          >
            <Highlighter aria-hidden className="h-4 w-4" />
            {t("responseTypes.annotateSource.highlightSelection")}
          </button>
          <p className="text-xs text-[var(--tp-text-secondary)]">
            {t("responseTypes.annotateSource.hint")}
          </p>
        </div>
      ) : null}

      <div
        ref={passageRef}
        id={passageId}
        className="tp-annotate-passage rounded-[var(--tp-radius-sm)] border border-[var(--tp-border)] bg-[var(--tp-bg-subtle)] p-4 text-[0.9375rem] leading-relaxed text-[var(--tp-text)]"
        data-empty={hasPassage ? undefined : "true"}
        data-selectable={!disabled && hasPassage ? "true" : undefined}
        onPointerUp={disabled ? undefined : handlePointerUp}
      >
        {renderPassage()}
      </div>

      {editing ? (
        <div
          className="rounded-[var(--tp-radius-sm)] border border-[var(--tp-border)] bg-[var(--tp-surface)] p-3"
          data-testid="annotate-note-editor"
        >
          <p className="text-xs text-[var(--tp-text-muted)]">
            “{passage.slice(editing.start, editing.end).slice(0, 80)}
            {editing.end - editing.start > 80 ? "…" : ""}”
          </p>
          <label className="mt-2 block text-sm font-medium">
            {t("responseTypes.annotateSource.noteLabel")}
            <textarea
              rows={2}
              value={noteDraft}
              onChange={(event) => setNoteDraft(event.target.value)}
              placeholder={t("responseTypes.annotateSource.notePlaceholder")}
              className="tp-input mt-2 w-full"
              autoFocus
            />
          </label>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" onClick={saveNote} className={`tp-btn-primary min-h-11 ${focusRing}`}>
              {t("responseTypes.annotateSource.saveNote")}
            </button>
            <button type="button" onClick={closeEditor} className={`tp-btn-ghost min-h-11 ${focusRing}`}>
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={removeHighlight}
              className={`tp-btn-ghost ml-auto inline-flex min-h-11 items-center gap-1.5 text-[var(--tp-danger-text)] ${focusRing}`}
            >
              <Trash2 aria-hidden className="h-4 w-4" />
              {t("responseTypes.annotateSource.removeHighlight")}
            </button>
          </div>
        </div>
      ) : null}

      {noteNumbers.size > 0 ? (
        <ol className="space-y-1 text-sm text-[var(--tp-text-secondary)]" data-testid="annotate-notes">
          {[...highlights]
            .sort((a, b) => a.start - b.start)
            .filter((h) => h.note)
            .map((h) => (
              <li key={`note-${h.id}`} className="flex gap-2">
                <span className="tp-annotate-note-ref tp-annotate-note-ref--list">{noteNumbers.get(h.id)}</span>
                <span>
                  <span className="font-medium text-[var(--tp-text)]">
                    “{passage.slice(h.start, h.end).slice(0, 40)}
                    {h.end - h.start > 40 ? "…" : ""}”
                  </span>
                  {" — "}
                  {h.note}
                </span>
              </li>
            ))}
        </ol>
      ) : null}
    </div>
  );
}
