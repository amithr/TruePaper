export type CaptureViolationKind = "getDisplayMedia" | "printScreen" | "screenshotShortcut";

export type ExamCaptureGuardOptions = {
  onViolation: (kind: CaptureViolationKind) => void;
};

const SCREENSHOT_SHORTCUT_KEYS = new Set(["3", "4", "5"]);

/** Short label repeated in the exam watermark (name + session fragment). */
export function formatExamWatermarkLabel(displayName: string, liveSessionId: string): string {
  const name = displayName.trim() || "Student";
  const sessionFragment = liveSessionId.replace(/-/g, "").slice(0, 8).toUpperCase();
  return `${name} · ${sessionFragment}`;
}

function isScreenshotShortcut(event: KeyboardEvent): boolean {
  if (event.key === "PrintScreen") {
    return true;
  }
  const mod = event.metaKey || event.ctrlKey;
  return mod && event.shiftKey && SCREENSHOT_SHORTCUT_KEYS.has(event.key);
}

/**
 * Best-effort guards during a live exam. Blocks in-browser screen capture APIs and
 * listens for common screenshot shortcuts. OS-level screenshots cannot be prevented
 * from a web page — pair with the exam watermark overlay for deterrence.
 */
export function installExamCaptureGuards(options: ExamCaptureGuardOptions): () => void {
  const { onViolation } = options;
  const cleanups: Array<() => void> = [];

  // Mobile Safari exposes mediaDevices but not getDisplayMedia — skip patching.
  if (
    typeof navigator !== "undefined" &&
    navigator.mediaDevices &&
    typeof navigator.mediaDevices.getDisplayMedia === "function"
  ) {
    const mediaDevices = navigator.mediaDevices;
    const original = mediaDevices.getDisplayMedia.bind(mediaDevices);
    mediaDevices.getDisplayMedia = async function getDisplayMediaBlocked(
      constraints?: DisplayMediaStreamOptions,
    ) {
      onViolation("getDisplayMedia");
      void constraints;
      throw new DOMException(
        "Screen capture is not allowed during the exam.",
        "NotAllowedError",
      );
    };
    cleanups.push(() => {
      mediaDevices.getDisplayMedia = original;
    });
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (!isScreenshotShortcut(event)) {
      return;
    }
    onViolation(event.key === "PrintScreen" ? "printScreen" : "screenshotShortcut");
  };

  if (typeof window !== "undefined") {
    window.addEventListener("keydown", onKeyDown, true);
    cleanups.push(() => {
      window.removeEventListener("keydown", onKeyDown, true);
    });
  }

  return () => {
    for (const cleanup of cleanups.reverse()) {
      cleanup();
    }
  };
}
