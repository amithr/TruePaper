import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/teacher/sessions/route";
import { TEST_TEACHER_SESSION } from "@/lib/test/mock-server";

const createSupabaseServerClient = vi.fn();
const getSessionUser = vi.fn();
const fetchActiveTeacherSessions = vi.fn();
const fetchPastTeacherSessions = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => createSupabaseServerClient(),
}));

vi.mock("@/lib/request-auth", () => ({
  getSessionUser: (...args: unknown[]) => getSessionUser(...args),
}));

vi.mock("@/lib/teacher-dashboard-server", () => ({
  fetchActiveTeacherSessions: (...args: unknown[]) => fetchActiveTeacherSessions(...args),
  fetchPastTeacherSessions: (...args: unknown[]) => fetchPastTeacherSessions(...args),
  PAST_SESSIONS_PAGE_SIZE: 10,
}));

describe("GET /api/teacher/sessions", () => {
  beforeEach(() => {
    createSupabaseServerClient.mockReset();
    getSessionUser.mockReset();
    fetchActiveTeacherSessions.mockReset();
    fetchPastTeacherSessions.mockReset();
    createSupabaseServerClient.mockResolvedValue({});
  });

  it("returns 401 without session", async () => {
    getSessionUser.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/teacher/sessions"));
    expect(res.status).toBe(401);
  });

  it("returns active sessions by default", async () => {
    getSessionUser.mockResolvedValue(TEST_TEACHER_SESSION);
    fetchActiveTeacherSessions.mockResolvedValue({ sessions: [], suspensionsBySession: {} });

    const res = await GET(new Request("http://localhost/api/teacher/sessions"));
    expect(res.status).toBe(200);
    expect(fetchActiveTeacherSessions).toHaveBeenCalled();
  });

  it("returns past sessions when scope=past", async () => {
    getSessionUser.mockResolvedValue(TEST_TEACHER_SESSION);
    fetchPastTeacherSessions.mockResolvedValue({ sessions: [], total: 0, page: 0 });

    const res = await GET(new Request("http://localhost/api/teacher/sessions?scope=past"));
    expect(res.status).toBe(200);
    expect(fetchPastTeacherSessions).toHaveBeenCalled();
  });
});
