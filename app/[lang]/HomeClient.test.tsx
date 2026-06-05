import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/i18n/client", () => ({
  useLocaleRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
  }),
  LocaleLink: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/lib/i18n/use-auto-uk-home", () => ({
  useAutoUkrainianHome: () => undefined,
}));

vi.mock("@/lib/use-body-focus-mode", () => ({
  useBodyFocusMode: () => undefined,
}));

vi.mock("@/lib/offline/use-offline-exam-sync", () => ({
  useOfflineExamSync: () => ({
    snapshot: {
      state: "synced",
      pendingCount: 0,
      lastSyncedAt: null,
      idbAvailable: true,
    },
    scheduleSync: vi.fn(),
    flushNow: vi.fn(),
    refreshPending: vi.fn(),
  }),
}));

vi.mock("@/lib/offline/air-alert", () => ({
  fetchAirAlertState: vi.fn().mockResolvedValue({ active: false, checkedAt: Date.now() }),
}));

vi.mock("@/lib/anonymous-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/anonymous-session")>();
  return {
    ...actual,
    getOrCreateAnonymousSessionId: () => "00000000-0000-4000-8000-000000000001",
    createFreshAnonymousSessionId: () => "00000000-0000-4000-8000-000000000002",
    persistAnonymousSessionId: vi.fn(),
    joinUrlRequestsFreshDevice: () => false,
  };
});

vi.mock("@/lib/home-url-intent", () => ({
  readTeacherHomeIntent: vi.fn(() => "builder"),
  readFormIdFromUrl: vi.fn(() => ""),
}));

vi.mock("@/lib/request-json", () => ({
  requestJson: vi.fn().mockResolvedValue({ forms: [] }),
}));

vi.mock("next/dynamic", () => ({
  default: () => () => null,
}));

vi.mock("@/components/LanguageToggle", () => ({
  LanguageToggle: () => <div data-testid="language-toggle" />,
}));

import HomeClient from "@/app/[lang]/HomeClient";
import { readTeacherHomeIntent } from "@/lib/home-url-intent";
import { renderWithI18n } from "@/lib/test/render-i18n";

describe("HomeClient", () => {
  it("renders guest join flow after URL sync", async () => {
    vi.mocked(readTeacherHomeIntent).mockReturnValue("join");

    renderWithI18n(<HomeClient initialSession={null} guestView="join" />);

    await waitFor(() => {
      expect(document.getElementById("join-session")).toBeInTheDocument();
    });
    expect(screen.getByRole("heading", { level: 2, name: /join a live session/i })).toBeInTheDocument();
  });

  it("renders teacher builder empty state when signed in", async () => {
    vi.mocked(readTeacherHomeIntent).mockReturnValue("builder");

    renderWithI18n(
      <HomeClient
        initialSession={{
          user: { id: "t1", email: "t@example.com" },
          profile: { role: "teacher", display_name: "Teacher" },
        }}
        guestView="landing"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("No form open")).toBeInTheDocument();
    });
  });
});
