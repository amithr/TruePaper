import { describe, expect, it } from "vitest";

import {
  examAnswerProgressTone,
  participantAvatarGradient,
  participantInitials,
} from "@/lib/participant-display";

describe("participant-display", () => {
  it("derives two-letter initials from full name", () => {
    expect(participantInitials("Ada Lovelace", "seed")).toBe("AL");
  });

  it("uses first two chars for single token names", () => {
    expect(participantInitials("Ada", "seed")).toBe("AD");
  });

  it("falls back to seed when name is empty", () => {
    expect(participantInitials("  ", "device-abc")).toBe("DE");
  });

  it("returns stable avatar gradient for a seed", () => {
    const a = participantAvatarGradient("device-1");
    const b = participantAvatarGradient("device-1");
    expect(a).toBe(b);
    expect(a).toMatch(/^linear-gradient/);
  });

  it("classifies exam progress tone", () => {
    expect(examAnswerProgressTone(10, 10)).toBe("complete");
    expect(examAnswerProgressTone(9, 10)).toBe("strong");
    expect(examAnswerProgressTone(3, 10)).toBe("mid");
    expect(examAnswerProgressTone(0, 0)).toBe("mid");
  });
});
