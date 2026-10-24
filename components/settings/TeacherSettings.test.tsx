import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TeacherSettings, type TeacherSettingsProps } from "@/components/settings/TeacherSettings";
import { RECOMMENDED_TEACHER_DEFAULTS } from "@/lib/teacher-defaults";
import { renderWithI18n } from "@/lib/test/render-i18n";

const requestJson = vi.fn();
const replace = vi.fn();
const refresh = vi.fn();
const choose = vi.fn();

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
  useLocaleRouter: () => ({ replace, refresh, push: vi.fn() }),
}));
vi.mock("@/lib/i18n/use-switch-locale", () => ({
  useSwitchLocale: () => ({ locale: "en", choose }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderSettings(over: Partial<TeacherSettingsProps> = {}) {
  return renderWithI18n(
    <TeacherSettings
      user={{ id: "u1", email: "maria.rivera@school.edu" }}
      profile={{ displayName: "Maria Rivera", avatarUrl: null }}
      defaults={{ ...RECOMMENDED_TEACHER_DEFAULTS }}
      usage={{ forms: 12, sessions: 38, students: 914 }}
      {...over}
    />,
  );
}

describe("TeacherSettings", () => {
  beforeEach(() => {
    requestJson.mockReset();
    replace.mockReset();
    refresh.mockReset();
    choose.mockReset();
  });

  it("gates Save changes on a dirty, valid name and shows Saved", async () => {
    requestJson.mockResolvedValue({ ok: true });
    renderSettings();
    const save = screen.getByTestId("settings-save-profile");
    expect(save).toBeDisabled();
    const input = screen.getByTestId("settings-display-name");
    fireEvent.change(input, { target: { value: "   " } });
    expect(save).toBeDisabled();
    fireEvent.change(input, { target: { value: "Ms. Rivera" } });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await waitFor(() => expect(screen.getByText("Saved")).toBeInTheDocument());
    expect(requestJson).toHaveBeenCalledWith(
      "/api/teacher/profile",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ displayName: "Ms. Rivera" }) }),
    );
    expect(save).toBeDisabled();
  });

  it("renders the locked guards as always-on switches and toggles the others", () => {
    renderSettings();
    const paste = screen.getByRole("switch", { name: /block paste/i });
    expect(paste).toBeDisabled();
    expect(paste).toHaveAttribute("aria-checked", "true");
    const feedback = screen.getByRole("switch", { name: /live teacher feedback/i });
    expect(feedback).toHaveAttribute("aria-checked", "true");
    fireEvent.click(feedback);
    expect(feedback).toHaveAttribute("aria-checked", "false");
    expect(screen.getByTestId("settings-save-defaults")).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: /reset to recommended/i }));
    expect(feedback).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("settings-save-defaults")).toBeDisabled();
  });

  it("dims late sync outside Live mode", () => {
    renderSettings();
    const lateSync = screen.getByRole("switch", { name: /saved offline/i });
    expect(lateSync).toBeEnabled();
    fireEvent.click(screen.getByRole("radio", { name: "Self-paced" }));
    expect(lateSync).toBeDisabled();
  });

  it("switches the locale through the shared hook", () => {
    renderSettings();
    fireEvent.click(screen.getByRole("radio", { name: /Українська/ }));
    expect(choose).toHaveBeenCalledWith("uk");
  });

  it("only deletes after the teacher types the word", async () => {
    requestJson.mockResolvedValue({ ok: true });
    renderSettings();
    fireEvent.click(screen.getByTestId("settings-delete-open"));
    const confirm = screen.getByTestId("settings-delete-confirm");
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByTestId("settings-delete-word"), { target: { value: "delete" } });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
    expect(requestJson).toHaveBeenCalledWith(
      "/api/teacher/account",
      expect.objectContaining({ method: "DELETE", body: JSON.stringify({ confirm: true }) }),
    );
  });

  it("shows usage figures", () => {
    renderSettings();
    expect(screen.getByText("914")).toBeInTheDocument();
    expect(screen.getByText("sessions this term")).toBeInTheDocument();
  });
});
