/** Two-letter initials for roster avatars. */
export function participantInitials(displayName: string, fallbackSeed: string): string {
  const trimmed = displayName.trim();
  if (trimmed) {
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0]!.charAt(0)}${parts[parts.length - 1]!.charAt(0)}`.toUpperCase();
    }
    return trimmed.slice(0, 2).toUpperCase();
  }
  return fallbackSeed.slice(0, 2).toUpperCase();
}

const AVATAR_GRADIENTS = [
  "linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)",
  "linear-gradient(135deg, #1e3a8a 0%, #38bdf8 100%)",
  "linear-gradient(135deg, #0f766e 0%, #22d3ee 100%)",
  "linear-gradient(135deg, #c2410c 0%, #fb7185 100%)",
  "linear-gradient(135deg, #4338ca 0%, #a78bfa 100%)",
  "linear-gradient(135deg, #0369a1 0%, #67e8f9 100%)",
] as const;

/** Stable avatar gradient from a device or name seed. */
export function participantAvatarGradient(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length]!;
}

export type ExamAnswerProgressTone = "complete" | "strong" | "mid";

/** Accent tone for in-exam question progress (answered / total). */
export function examAnswerProgressTone(
  answered: number,
  total: number,
): ExamAnswerProgressTone {
  if (total <= 0) {
    return "mid";
  }
  const ratio = answered / total;
  if (ratio >= 1) {
    return "complete";
  }
  if (ratio >= 0.85) {
    return "strong";
  }
  return "mid";
}
