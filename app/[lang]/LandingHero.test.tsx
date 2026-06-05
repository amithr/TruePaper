import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LandingHero } from "@/app/[lang]/LandingHero";
import { renderWithI18n } from "@/lib/test/render-i18n";

vi.mock("@/lib/i18n/client", () => ({
  LocaleLink: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe("LandingHero", () => {
  it("renders guest marketing headline and CTAs", () => {
    renderWithI18n(<LandingHero teacherCtaHref="/register" joinHref="/join" />);
    expect(screen.getByText(/TruePaper/i)).toBeInTheDocument();
    const teacherLinks = screen.getAllByRole("link", {
      name: /create your first live exam/i,
    });
    expect(teacherLinks[0]).toHaveAttribute("href", "/register");
    expect(screen.getByRole("link", { name: /join as a student/i })).toHaveAttribute(
      "href",
      "/join",
    );
  });
});
