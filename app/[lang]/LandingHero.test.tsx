import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LandingHero } from "@/app/[lang]/LandingHero";
import { renderWithI18n } from "@/lib/test/render-i18n";

const push = vi.fn();

vi.mock("@/lib/i18n/client", () => ({
  LocaleLink: ({
    children,
    href,
    className,
  }: {
    children: React.ReactNode;
    href: string;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
  useLocaleRouter: () => ({ push }),
}));

vi.mock("@/components/LanguageToggle", () => ({
  LanguageToggle: () => <div data-testid="language-toggle" />,
}));

describe("LandingHero", () => {
  it("leads with the offline-first story and both CTAs", () => {
    renderWithI18n(<LandingHero teacherCtaHref="/register" joinHref="/join" />);
    expect(
      screen.getByRole("heading", { level: 1, name: /live exams that survive the wi‑fi/i }),
    ).toBeInTheDocument();
    for (const link of screen.getAllByRole("link", { name: /start a free exam/i })) {
      expect(link).toHaveAttribute("href", "/register");
    }
    expect(screen.getByRole("link", { name: /i have a session code/i })).toHaveAttribute(
      "href",
      "#join",
    );
    expect(screen.getByRole("link", { name: /sign in/i })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: /^investors$/i })).toHaveAttribute("href", "#investors");
    expect(screen.getByTestId("language-toggle")).toBeInTheDocument();
  });

  it("tells the resilience story in plain sections", () => {
    renderWithI18n(<LandingHero />);
    expect(screen.getByRole("heading", { name: /wi‑fi drops/i, level: 3 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /power cuts out/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /three steps, one class period/i })).toBeInTheDocument();
    // No deck link until a real destination is configured.
    expect(screen.queryByRole("link", { name: /request the deck/i })).toBeNull();
  });

  it("validates the session code before sending students to /join", () => {
    push.mockClear();
    renderWithI18n(<LandingHero joinHref="/join" />);
    const input = screen.getByTestId("landing-join-code");

    fireEvent.change(input, { target: { value: "abc" } });
    fireEvent.click(screen.getByRole("button", { name: /^join$/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/6-character code/i);
    expect(push).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "mkt294" } });
    fireEvent.click(screen.getByRole("button", { name: /^join$/i }));
    expect(push).toHaveBeenCalledWith("/join?code=MKT294");
  });

  it("offers demo chapter chips and a play/pause control", () => {
    renderWithI18n(<LandingHero />);
    const chips = screen.getAllByRole("button", { name: /^\d\d/ });
    expect(chips).toHaveLength(6);
    expect(chips[0]).toHaveAttribute("aria-current", "step");
    fireEvent.click(chips[3]);
    expect(chips[3]).toHaveAttribute("aria-current", "step");
    expect(screen.getByRole("button", { name: /play or pause the demo/i })).toBeInTheDocument();
  });
});
