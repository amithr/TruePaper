import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdminDashboard } from "@/components/admin/AdminDashboard";
import type { AdminOverview, AdminUserRow } from "@/lib/admin/types";
import { renderWithI18n } from "@/lib/test/render-i18n";

const requestJson = vi.fn();

vi.mock("@/lib/request-json", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/request-json")>()),
  requestJson: (...args: unknown[]) => requestJson(...args),
}));
vi.mock("@/lib/i18n/client", () => ({
  LocaleLink: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useLocaleRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/lib/i18n/use-switch-locale", () => ({
  useSwitchLocale: () => ({ locale: "en", choose: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const overview: AdminOverview = {
  billingEnabled: true,
  users: 12,
  teachers: 11,
  admins: 1,
  paid: 2,
  forms: 40,
  sessions: 90,
  sessionsLast7Days: 7,
  submissions: 800,
};

const user = (over: Partial<AdminUserRow> = {}): AdminUserRow => ({
  id: "b2c3d4e5-f6a7-4890-b123-456789abcdef",
  email: "maria@school.edu",
  displayName: "Maria Rivera",
  avatarUrl: null,
  role: "teacher",
  isAdmin: false,
  planOverride: null,
  createdAt: "2026-09-01T00:00:00Z",
  lastSignInAt: null,
  billingPlan: "classroom",
  billingStatus: "active",
  formsCount: 3,
  sessionsCount: 5,
  lastSessionAt: "2026-10-20T00:00:00Z",
  ...over,
});

function mockApi() {
  requestJson.mockImplementation((url: string, init?: { method?: string; body?: string }) => {
    if (url === "/api/admin/overview") {
      return Promise.resolve(overview);
    }
    if (url.startsWith("/api/admin/users?")) {
      const q = new URL(url, "http://x").searchParams.get("q") ?? "";
      const rows = [user(), user({ id: "c3d4e5f6-a7b8-4901-8234-56789abcdef0", email: "sam@school.edu", displayName: "Sam Okafor", billingPlan: null, billingStatus: null })];
      const filtered = rows.filter((r) => !q || r.email!.includes(q) || r.displayName!.toLowerCase().includes(q));
      return Promise.resolve({ total: filtered.length, users: filtered });
    }
    if (url === "/api/admin/settings") {
      return Promise.resolve({ ok: true, billingEnabled: JSON.parse(init!.body!).billingEnabled });
    }
    if (url.startsWith("/api/admin/users/") && (!init || init.method !== "PATCH")) {
      return Promise.resolve({ ok: true, profile: { ...user(), onboardingTourCompletedAt: null }, billing: null, forms: [], sessions: [] });
    }
    if (init?.method === "PATCH") {
      return Promise.resolve({ ok: true });
    }
    return Promise.reject(new Error(`unexpected ${url}`));
  });
}

describe("AdminDashboard", () => {
  beforeEach(() => {
    requestJson.mockReset();
    mockApi();
  });

  it("shows platform counts and the account list with effective plans", async () => {
    renderWithI18n(<AdminDashboard currentUserId="me" />);
    await waitFor(() => expect(screen.getByTestId("admin-stats")).toHaveTextContent("12"));
    await waitFor(() => expect(screen.getAllByTestId("admin-user-row")).toHaveLength(2));
    const [maria, sam] = screen.getAllByTestId("admin-user-row");
    expect(maria).toHaveTextContent("Classroom");
    expect(sam).toHaveTextContent("Free");
  });

  it("flips the global billing switch", async () => {
    renderWithI18n(<AdminDashboard currentUserId="me" />);
    const toggle = await screen.findByRole("switch", { name: /teachers are billed by plan/i });
    fireEvent.click(toggle);
    await waitFor(() =>
      expect(requestJson).toHaveBeenCalledWith(
        "/api/admin/settings",
        expect.objectContaining({ method: "PUT", body: JSON.stringify({ billingEnabled: false }) }),
      ),
    );
    expect(await screen.findByRole("switch", { name: /everything is free/i })).toHaveAttribute("aria-checked", "false");
  });

  it("searches, opens an account and grants a complimentary plan", async () => {
    renderWithI18n(<AdminDashboard currentUserId="me" />);
    await screen.findAllByTestId("admin-user-row");
    fireEvent.change(screen.getByPlaceholderText(/search by email or name/i), { target: { value: "sam" } });
    await waitFor(() => expect(screen.getAllByTestId("admin-user-row")).toHaveLength(1));
    fireEvent.click(screen.getByTestId("admin-user-row"));
    const select = await screen.findByTestId("admin-plan-override");
    fireEvent.change(select, { target: { value: "department" } });
    await waitFor(() =>
      expect(requestJson).toHaveBeenCalledWith(
        expect.stringMatching(/^\/api\/admin\/users\/[0-9a-f-]+$/),
        expect.objectContaining({ method: "PATCH", body: JSON.stringify({ planOverride: "department" }) }),
      ),
    );
    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });
});
