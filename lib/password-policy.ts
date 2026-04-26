export type PasswordRequirementStatus = {
  minLength: boolean;
  lowercase: boolean;
  uppercase: boolean;
  digit: boolean;
  symbol: boolean;
};

const REQUIREMENT_LABELS: { key: keyof PasswordRequirementStatus; label: string }[] = [
  { key: "minLength", label: "At least 12 characters" },
  { key: "lowercase", label: "One lowercase letter" },
  { key: "uppercase", label: "One uppercase letter" },
  { key: "digit", label: "One number" },
  { key: "symbol", label: "One symbol (e.g. punctuation)" },
];

export function getPasswordRequirementStatus(password: string): PasswordRequirementStatus {
  return {
    minLength: password.length >= 12,
    lowercase: /[a-z]/.test(password),
    uppercase: /[A-Z]/.test(password),
    digit: /[0-9]/.test(password),
    symbol: /[^A-Za-z0-9]/.test(password),
  };
}

export function isPasswordStrong(password: string): boolean {
  const status = getPasswordRequirementStatus(password);
  return Object.values(status).every(Boolean);
}

export function getPasswordRequirementLabels(): typeof REQUIREMENT_LABELS {
  return REQUIREMENT_LABELS;
}

/**
 * Shared password rules for teacher registration (client + server).
 * Returns `null` if valid, otherwise a short error message.
 */
export function validatePasswordStrength(password: string): string | null {
  const status = getPasswordRequirementStatus(password);
  if (!status.minLength) {
    return "Password must be at least 12 characters.";
  }
  if (!status.lowercase) {
    return "Password must include at least one lowercase letter.";
  }
  if (!status.uppercase) {
    return "Password must include at least one uppercase letter.";
  }
  if (!status.digit) {
    return "Password must include at least one digit.";
  }
  if (!status.symbol) {
    return "Password must include at least one symbol (e.g. punctuation).";
  }
  return null;
}
