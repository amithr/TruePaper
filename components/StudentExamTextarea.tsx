"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type CompositionEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";

type Props = {
  id: string;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  /** When true, apply client-side anti-paste layers that still allow typing. */
  protect: boolean;
  rows?: number;
  placeholder?: string;
  className?: string;
};

/**
 * Aggressive paste blocking for live exams. Not bypass-proof.
 *
 * Not used here (would block normal typing or are out of scope for this component):
 * - readonly / disabled while answering
 * - pointer-events:none on the field; full-screen overlay (blocks focus/clicks)
 * - canvas-based input, Shadow DOM, full fake-div keyboard-only editor
 */
export function StudentExamTextarea({
  id,
  value,
  onChange,
  disabled = false,
  protect,
  rows = 4,
  placeholder,
  className,
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const lastGoodRef = useRef(value);
  const lastKeyDownAtRef = useRef(0);
  const insertStreakRef = useRef(0);
  const [domKey, setDomKey] = useState(0);

  useEffect(() => {
    lastGoodRef.current = value;
  }, [value]);

  const bumpRemount = useCallback(() => {
    setDomKey((k) => k + 1);
  }, []);

  const revertToLastGood = useCallback(() => {
    const prev = lastGoodRef.current;
    onChange(prev);
    bumpRemount();
  }, [onChange, bumpRemount]);

  const applyFromDom = useCallback(
    (next: string, inputType: string | undefined) => {
      if (!protect || disabled) {
        onChange(next);
        lastGoodRef.current = next;
        return;
      }

      const prev = lastGoodRef.current;

      if (
        inputType &&
        (inputType.includes("omposition") || inputType === "insertFromComposition")
      ) {
        onChange(next);
        lastGoodRef.current = next;
        return;
      }

      if (inputType === "insertFromPaste" || inputType === "insertFromPasteAsQuotation") {
        revertToLastGood();
        return;
      }
      if (inputType === "insertFromDrop") {
        revertToLastGood();
        return;
      }
      if (inputType === "insertReplacementText" && Math.abs(next.length - prev.length) > 24) {
        revertToLastGood();
        return;
      }

      const delta = next.length - prev.length;
      if (delta > 18) {
        revertToLastGood();
        return;
      }
      if (inputType === "insertText" && delta > 3) {
        const ms = Date.now() - lastKeyDownAtRef.current;
        if (ms > 90 && insertStreakRef.current < 2) {
          revertToLastGood();
          return;
        }
      }

      onChange(next);
      lastGoodRef.current = next;
    },
    [protect, disabled, onChange, revertToLastGood],
  );

  const handleBeforeInput = useCallback(
    (e: FormEvent<HTMLTextAreaElement>) => {
      if (!protect || disabled) {
        return;
      }
      const t = (e.nativeEvent as InputEvent).inputType;
      if (
        t === "insertFromPaste" ||
        t === "insertFromPasteAsQuotation" ||
        t === "insertFromDrop"
      ) {
        e.preventDefault();
      }
    },
    [protect, disabled],
  );

  const handlePaste = useCallback(
    async (e: ClipboardEvent<HTMLTextAreaElement>) => {
      if (!protect || disabled) {
        return;
      }
      e.preventDefault();
      try {
        await navigator.clipboard.readText();
      } catch {
        /* permission denied or unsupported */
      }
      revertToLastGood();
    },
    [protect, disabled, revertToLastGood],
  );

  const handleDrop = useCallback(
    (e: DragEvent<HTMLTextAreaElement>) => {
      if (!protect || disabled) {
        return;
      }
      e.preventDefault();
      revertToLastGood();
    },
    [protect, disabled, revertToLastGood],
  );

  const handleContextMenu = useCallback(
    (e: { preventDefault: () => void }) => {
      if (!protect || disabled) {
        return;
      }
      e.preventDefault();
    },
    [protect, disabled],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (!protect || disabled) {
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === "v" || e.key === "V")) {
        e.preventDefault();
        return;
      }
      if (e.shiftKey && e.key === "Insert") {
        e.preventDefault();
        return;
      }
      if (e.key.length === 1 && !mod && !e.altKey) {
        lastKeyDownAtRef.current = Date.now();
        insertStreakRef.current += 1;
        window.setTimeout(() => {
          insertStreakRef.current = Math.max(0, insertStreakRef.current - 1);
        }, 120);
      } else if (e.key === "Backspace" || e.key === "Delete" || e.key === "Enter") {
        lastKeyDownAtRef.current = Date.now();
      }
    },
    [protect, disabled],
  );

  const handleInput = useCallback(
    (e: FormEvent<HTMLTextAreaElement>) => {
      if (!protect || disabled) {
        return;
      }
      const ne = e.nativeEvent as InputEvent;
      if (ne.isComposing) {
        onChange(e.currentTarget.value);
        return;
      }
      applyFromDom(e.currentTarget.value, ne.inputType);
    },
    [protect, disabled, onChange, applyFromDom],
  );

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      if (protect && !disabled) {
        return;
      }
      onChange(e.target.value);
      lastGoodRef.current = e.target.value;
    },
    [protect, disabled, onChange],
  );

  useEffect(() => {
    if (!protect || disabled) {
      return;
    }
    const idInterval = window.setInterval(() => {
      const el = ref.current;
      if (!el) {
        return;
      }
      if (el.value !== value) {
        onChange(value);
        bumpRemount();
      }
    }, 350);
    return () => window.clearInterval(idInterval);
  }, [protect, disabled, value, onChange, bumpRemount]);

  if (!protect) {
    return (
      <textarea
        id={id}
        name={id}
        rows={rows}
        value={value}
        disabled={disabled}
        onChange={handleChange}
        placeholder={placeholder}
        className={className}
      />
    );
  }

  return (
    <textarea
      key={domKey}
      ref={ref}
      id={id}
      name={id}
      rows={rows}
      value={value}
      disabled={disabled}
      spellCheck={false}
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      placeholder={placeholder}
      className={className}
      onChange={handleChange}
      onBeforeInput={handleBeforeInput}
      onPaste={handlePaste}
      onDrop={handleDrop}
      onContextMenu={handleContextMenu}
      onKeyDown={handleKeyDown}
      onInput={handleInput}
      onCompositionEnd={(e: CompositionEvent<HTMLTextAreaElement>) => {
        lastKeyDownAtRef.current = Date.now();
        applyFromDom(e.currentTarget.value, "insertFromComposition");
      }}
    />
  );
}
