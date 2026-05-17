"use client";

import {
  useCallback,
  useRef,
  type ChangeEvent,
  type ClipboardEvent,
  type CompositionEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";

type Props = {
  id: string;
  /** Initial text when this question mounts (e.g. after load). Not updated on parent re-renders. */
  defaultValue?: string;
  onValueChange: (next: string) => void;
  disabled?: boolean;
  /** When true, apply client-side anti-paste layers that still allow typing. */
  protect: boolean;
  rows?: number;
  placeholder?: string;
  className?: string;
};

/**
 * Uncontrolled textarea for live exams so autosave / realtime re-renders never reset typed text.
 * Parent must remount via `key` when loading saved answers from the server.
 */
export function StudentExamTextarea({
  id,
  defaultValue = "",
  onValueChange,
  disabled = false,
  protect,
  rows = 4,
  placeholder,
  className,
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const lastGoodRef = useRef(defaultValue);

  const emit = useCallback(
    (next: string) => {
      lastGoodRef.current = next;
      onValueChange(next);
    },
    [onValueChange],
  );

  const revertToLastGood = useCallback(() => {
    const prev = lastGoodRef.current;
    if (ref.current) {
      ref.current.value = prev;
    }
    emit(prev);
  }, [emit]);

  const applyFromDom = useCallback(
    (next: string, inputType: string | undefined) => {
      if (!protect || disabled) {
        emit(next);
        return;
      }

      const prev = lastGoodRef.current;

      if (
        inputType &&
        (inputType.includes("omposition") || inputType === "insertFromComposition")
      ) {
        emit(next);
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
      if (inputType === "insertReplacementText" && Math.abs(next.length - prev.length) > 48) {
        revertToLastGood();
        return;
      }

      const delta = next.length - prev.length;
      if (Math.abs(delta) > 64) {
        revertToLastGood();
        return;
      }

      emit(next);
    },
    [protect, disabled, emit, revertToLastGood],
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
        emit(e.currentTarget.value);
        return;
      }
      applyFromDom(e.currentTarget.value, ne.inputType);
    },
    [protect, disabled, emit, applyFromDom],
  );

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      if (protect && !disabled) {
        return;
      }
      emit(e.target.value);
    },
    [protect, disabled, emit],
  );

  return (
    <textarea
      ref={ref}
      id={id}
      name={id}
      rows={rows}
      defaultValue={defaultValue}
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
        applyFromDom(e.currentTarget.value, "insertFromComposition");
      }}
    />
  );
}
