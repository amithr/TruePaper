"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";

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

function newHighlightId(): string {
  return `h-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
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
  const [tool, setTool] = useState<"highlight" | "note">("highlight");
  const [pendingNote, setPendingNote] = useState<{ id: string; start: number; end: number } | null>(
    null,
  );
  const [noteDraft, setNoteDraft] = useState("");

  const passage = config.passageText || t("responseTypes.annotateSource.emptyPassage");

  const handleMouseUp = useCallback(() => {
    if (disabled || tool !== "highlight") {
      return;
    }
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !passageRef.current) {
      return;
    }
    const range = selection.getRangeAt(0);
    if (!passageRef.current.contains(range.commonAncestorContainer)) {
      return;
    }
    const preRange = document.createRange();
    preRange.selectNodeContents(passageRef.current);
    preRange.setEnd(range.startContainer, range.startOffset);
    const start = preRange.toString().length;
    const end = start + range.toString().length;
    if (end <= start) {
      return;
    }
    const id = newHighlightId();
    if (tool === "highlight") {
      onChange([...highlights, { id, start, end }]);
    }
    selection.removeAllRanges();
  }, [disabled, highlights, onChange, tool]);

  const renderPassage = () => {
    if (highlights.length === 0) {
      return passage;
    }
    const sorted = [...highlights].sort((a, b) => a.start - b.start);
    const chunks: ReactNode[] = [];
    let cursor = 0;
    for (const span of sorted) {
      if (span.start > cursor) {
        chunks.push(passage.slice(cursor, span.start));
      }
      chunks.push(
        <mark
          key={span.id}
          className="tp-annotate-highlight cursor-pointer rounded-sm bg-[var(--tp-amber-soft)] px-0.5"
          onClick={() => {
            if (disabled) return;
            setPendingNote({ id: span.id, start: span.start, end: span.end });
            setNoteDraft(span.note ?? "");
            setTool("note");
          }}
        >
          {passage.slice(span.start, span.end)}
        </mark>,
      );
      cursor = span.end;
    }
    if (cursor < passage.length) {
      chunks.push(passage.slice(cursor));
    }
    return chunks;
  };

  const saveNote = () => {
    if (!pendingNote) {
      return;
    }
    onChange(
      highlights.map((span) =>
        span.id === pendingNote.id ? { ...span, note: noteDraft.trim() } : span,
      ),
    );
    setPendingNote(null);
    setNoteDraft("");
    setTool("highlight");
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button
          type="button"
          disabled={disabled}
          aria-pressed={tool === "highlight"}
          onClick={() => setTool("highlight")}
          className={`min-h-11 rounded-full border px-4 text-sm font-semibold ${focusRing} ${
            tool === "highlight"
              ? "border-[var(--tp-accent)] bg-[var(--tp-accent-soft)]"
              : "border-[var(--tp-border)]"
          }`}
        >
          {t("responseTypes.annotateSource.highlightTool")}
        </button>
        <button
          type="button"
          disabled={disabled}
          aria-pressed={tool === "note"}
          onClick={() => setTool("note")}
          className={`min-h-11 rounded-full border px-4 text-sm font-semibold ${focusRing} ${
            tool === "note"
              ? "border-[var(--tp-accent)] bg-[var(--tp-accent-soft)]"
              : "border-[var(--tp-border)]"
          }`}
        >
          {t("responseTypes.annotateSource.noteTool")}
        </button>
      </div>

      <div
        ref={passageRef}
        id={passageId}
        className="tp-annotate-passage rounded-[var(--tp-radius-sm)] border border-[var(--tp-border)] bg-[var(--tp-bg-subtle)] p-4 text-sm leading-relaxed text-[var(--tp-text)] select-text"
        onMouseUp={handleMouseUp}
      >
        {renderPassage()}
      </div>

      {pendingNote ? (
        <div className="rounded-[var(--tp-radius-sm)] border border-[var(--tp-border)] bg-[var(--tp-surface)] p-3">
          <label className="block text-sm font-medium">
            {t("responseTypes.annotateSource.noteLabel")}
            <textarea
              rows={2}
              value={noteDraft}
              onChange={(event) => setNoteDraft(event.target.value)}
              className="tp-input mt-2 w-full"
              autoFocus
            />
          </label>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={saveNote} className={`tp-btn-primary min-h-11 ${focusRing}`}>
              {t("common.save")}
            </button>
            <button
              type="button"
              onClick={() => {
                setPendingNote(null);
                setNoteDraft("");
              }}
              className={`tp-btn-ghost min-h-11 ${focusRing}`}
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
      ) : null}

      {highlights.some((h) => h.note) ? (
        <ul className="space-y-1 text-sm text-[var(--tp-text-secondary)]">
          {highlights
            .filter((h) => h.note)
            .map((h) => (
              <li key={`note-${h.id}`}>
                <span className="font-medium text-[var(--tp-text)]">
                  “{passage.slice(h.start, h.end).slice(0, 40)}
                  {h.end - h.start > 40 ? "…" : ""}”
                </span>
                {" — "}
                {h.note}
              </li>
            ))}
        </ul>
      ) : null}
    </div>
  );
}
