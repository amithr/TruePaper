import { vi } from "vitest";

export const TEST_TEACHER_USER = {
  id: "teacher-user-uuid-0001",
  email: "teacher@example.com",
};

export const TEST_TEACHER_SESSION = {
  user: TEST_TEACHER_USER,
  profile: { role: "teacher" as const, display_name: "Teacher" },
};

export function createMockSupabaseServer(handlers: {
  signInWithPassword?: () => Promise<{ error: { message: string } | null }>;
  signUp?: () => Promise<{
    data: { user: { id: string; email: string } | null; session: unknown };
    error: { message: string } | null;
  }>;
  insertResult?: { data: Record<string, unknown> | null; error: { message: string; code?: string } | null };
} = {}) {
  const insertSingle = vi.fn().mockResolvedValue(
    handlers.insertResult ?? {
      data: {
        id: "session-uuid-1",
        join_code: "ABCDEF",
        opens_at: new Date().toISOString(),
        closes_at: new Date(Date.now() + 3_600_000).toISOString(),
        delivery_mode: "live",
      },
      error: null,
    },
  );

  return {
    auth: {
      signInWithPassword:
        handlers.signInWithPassword ??
        vi.fn().mockResolvedValue({ error: null }),
      signUp:
        handlers.signUp ??
        vi.fn().mockResolvedValue({
          data: { user: TEST_TEACHER_USER, session: null },
          error: null,
        }),
    },
    from: vi.fn(() => ({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: insertSingle,
        })),
      })),
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        })),
      })),
    })),
    _insertSingle: insertSingle,
  };
}
