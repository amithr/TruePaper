import { beforeEach, describe, expect, it } from "vitest";

import {
  ACTIVE_EXAM_STORAGE_KEY,
  clearActiveExam,
  loadActiveExam,
  saveActiveExam,
} from "@/lib/active-exam";

const DEVICE = "8f1c2b9e-5d4a-4c3b-9a1e-2f3d4c5b6a7e";
const NOW = Date.parse("2026-10-19T10:00:00Z");

const exam = {
  liveSessionId: "11111111-1111-4111-8111-111111111111",
  joinCode: "ABC234",
  displayName: "Jordan Lee",
  deviceId: DEVICE,
  opensAt: "2026-10-19T09:00:00Z",
  closesAt: "2026-10-19T11:00:00Z",
  deliveryMode: "live" as const,
};

describe("active exam storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("round-trips the exam for the same device", () => {
    saveActiveExam(exam);
    expect(loadActiveExam(DEVICE, NOW)).toMatchObject(exam);
    expect(loadActiveExam(DEVICE.toUpperCase(), NOW)).toMatchObject(exam);
  });

  it("ignores and clears an exam saved by another device id", () => {
    saveActiveExam(exam);
    expect(loadActiveExam("00000000-0000-4000-8000-000000000000", NOW)).toBeNull();
    expect(window.localStorage.getItem(ACTIVE_EXAM_STORAGE_KEY)).toBeNull();
  });

  it("drops the exam once its window has closed", () => {
    saveActiveExam(exam);
    expect(loadActiveExam(DEVICE, Date.parse("2026-10-19T11:00:01Z"))).toBeNull();
    expect(window.localStorage.getItem(ACTIVE_EXAM_STORAGE_KEY)).toBeNull();
  });

  it("clears malformed entries", () => {
    window.localStorage.setItem(ACTIVE_EXAM_STORAGE_KEY, '{"liveSessionId":1}');
    expect(loadActiveExam(DEVICE, NOW)).toBeNull();
    expect(window.localStorage.getItem(ACTIVE_EXAM_STORAGE_KEY)).toBeNull();
    window.localStorage.setItem(ACTIVE_EXAM_STORAGE_KEY, "not json");
    expect(loadActiveExam(DEVICE, NOW)).toBeNull();
  });

  it("clearActiveExam removes it", () => {
    saveActiveExam(exam);
    clearActiveExam();
    expect(loadActiveExam(DEVICE, NOW)).toBeNull();
  });
});
