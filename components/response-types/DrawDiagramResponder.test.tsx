import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DrawDiagramResponder } from "@/components/response-types/DrawDiagramResponder";
import { renderWithI18n } from "@/lib/test/render-i18n";

vi.mock("@/components/DrawingCanvas", () => ({
  DrawingCanvas: (props: {
    "data-testid"?: string;
    width: number;
    height: number;
    backgroundImageUrl?: string;
  }) => (
    <div
      data-testid={props["data-testid"]}
      data-width={props.width}
      data-height={props.height}
      data-background={props.backgroundImageUrl ?? ""}
    />
  ),
}));

describe("DrawDiagramResponder", () => {
  it("renders canvas with configured dimensions", () => {
    renderWithI18n(
      <DrawDiagramResponder
        strokes={[]}
        disabled={false}
        config={{ width: 500, height: 300 }}
        onChange={vi.fn()}
      />,
    );
    const canvas = screen.getByTestId("student-draw-canvas");
    expect(canvas).toHaveAttribute("data-width", "500");
    expect(canvas).toHaveAttribute("data-height", "300");
  });

  it("prefers the resolved background image over legacy config data URL", () => {
    renderWithI18n(
      <DrawDiagramResponder
        strokes={[]}
        disabled={false}
        config={{ backgroundDataUrl: "data:image/png;base64,legacy" }}
        backgroundImageUrl="https://cdn.example/bg.jpg"
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId("student-draw-canvas")).toHaveAttribute(
      "data-background",
      "https://cdn.example/bg.jpg",
    );
  });

  it("falls back to config backgroundDataUrl without a resolved background", () => {
    renderWithI18n(
      <DrawDiagramResponder
        strokes={[]}
        disabled={false}
        config={{ backgroundDataUrl: "data:image/png;base64,legacy" }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId("student-draw-canvas")).toHaveAttribute(
      "data-background",
      "data:image/png;base64,legacy",
    );
  });
});
