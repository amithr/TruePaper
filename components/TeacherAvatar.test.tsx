import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TeacherAvatar } from "@/components/TeacherAvatar";
import { StudentTeacherFeedbackCard } from "@/components/StudentTeacherFeedbackCard";
import { renderWithI18n } from "@/lib/test/render-i18n";

describe("TeacherAvatar", () => {
  it("shows the photo when there is one, otherwise initials on the gradient", () => {
    const { rerender } = render(<TeacherAvatar name="Maria Rivera" avatarUrl="https://x/a.png" size="xs" />);
    expect(screen.getByTestId("teacher-avatar").querySelector("img")).toHaveAttribute("src", "https://x/a.png");
    expect(screen.getByTestId("teacher-avatar")).toHaveClass("tp-avatar--xs");
    rerender(<TeacherAvatar name="Maria Rivera" avatarUrl={null} />);
    expect(screen.getByTestId("teacher-avatar")).toHaveTextContent("MR");
    expect(screen.getByTestId("teacher-avatar").querySelector("img")).toBeNull();
  });
});

describe("StudentTeacherFeedbackCard", () => {
  it("signs the bubble with the teacher when the host is known", () => {
    renderWithI18n(<StudentTeacherFeedbackCard message="Nice work" host={{ displayName: "Ms. Rivera", avatarUrl: null }} />);
    expect(screen.getByText("Feedback from Ms. Rivera")).toBeInTheDocument();
    expect(screen.getByTestId("teacher-avatar")).toHaveTextContent("MR");
  });

  it("falls back to the generic title without a host", () => {
    renderWithI18n(<StudentTeacherFeedbackCard message="Nice work" />);
    expect(screen.getByText("Your teacher says")).toBeInTheDocument();
    expect(screen.queryByTestId("teacher-avatar")).not.toBeInTheDocument();
  });
});
