import { describe, expect, it } from "vitest";

import {
  getPasswordRequirementStatus,
  isPasswordStrong,
  validatePasswordStrength,
} from "@/lib/password-policy";

describe("password-policy", () => {
  it("flags missing requirements", () => {
    expect(getPasswordRequirementStatus("short")).toEqual({
      minLength: false,
      lowercase: true,
      uppercase: false,
      digit: false,
      symbol: false,
    });
  });

  it("accepts a strong password", () => {
    const strong = "ValidPassw0rd!";
    expect(isPasswordStrong(strong)).toBe(true);
    expect(validatePasswordStrength(strong)).toBeNull();
  });

  it("returns specific validation errors", () => {
    expect(validatePasswordStrength("ValidPassw0rd")).toMatch(/symbol/i);
    expect(validatePasswordStrength("validpassw0rd!")).toMatch(/uppercase/i);
  });
});
