"use client";

import { useEffect } from "react";

import { useLatestRef } from "@/lib/use-latest-ref";

export type PresentationKeyHandlers = {
  next: () => void;
  prev: () => void;
  first: () => void;
  last: () => void;
  toggleAnswer: () => void;
  toggleResults: () => void;
  toggleFullscreen: () => void;
};

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

/** Keyboard / clicker navigation for the projector: arrows, Space, PageUp/Down, Home/End, A, R, F. */
export function usePresentationKeys(handlers: PresentationKeyHandlers, enabled = true): void {
  const ref = useLatestRef(handlers);
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) {
        return;
      }
      const h = ref.current;
      switch (event.key) {
        case "ArrowRight":
        case "PageDown":
        case " ":
        case "Enter":
          event.preventDefault();
          h.next();
          return;
        case "ArrowLeft":
        case "PageUp":
        case "Backspace":
          event.preventDefault();
          h.prev();
          return;
        case "Home":
          event.preventDefault();
          h.first();
          return;
        case "End":
          event.preventDefault();
          h.last();
          return;
        default:
          break;
      }
      switch (event.key.toLowerCase()) {
        case "a":
          h.toggleAnswer();
          return;
        case "r":
          h.toggleResults();
          return;
        case "f":
          h.toggleFullscreen();
          return;
        default:
          return;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, ref]);
}
