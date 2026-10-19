import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DrawDiagramResponder } from "@/components/response-types/DrawDiagramResponder";
import { renderWithI18n } from "@/lib/test/render-i18n";

vi.mock("@/components/DrawingCanvas", () => ({
  DrawingCanvas: (props: {
    "data-testid"?: string;
    width: number;
    height: number;
    backgroundImageUrl?: string;
    toolbarStart?: React.ReactNode;
  }) => (
    <>
      {props.toolbarStart}
      <div
        data-testid={props["data-testid"]}
        data-width={props.width}
        data-height={props.height}
        data-background={props.backgroundImageUrl ?? ""}
      />
    </>
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

vi.mock("@/lib/image-compress", () => ({
  compressImageFile: vi.fn(() =>
    Promise.resolve({ dataUrl: "data:image/jpeg;base64,AAA", width: 800, height: 600 }),
  ),
}));

describe("DrawDiagramResponder photo upload", () => {
  const photo = { dataUrl: "data:image/jpeg;base64,PHOTO", width: 800, height: 600 };

  it("offers Draw / Upload a photo and uploads a compressed photo", async () => {
    const onPhotoChange = vi.fn();
    renderWithI18n(
      <DrawDiagramResponder
        strokes={[]}
        disabled={false}
        config={{}}
        onChange={vi.fn()}
        onPhotoChange={onPhotoChange}
      />,
    );

    expect(screen.getByRole("button", { name: "Draw" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Upload a photo" }));
    expect(screen.queryByTestId("student-draw-canvas")).toBeNull();

    const input = screen.getByTestId("student-photo-upload").querySelector("input[type=file]")!;
    fireEvent.change(input, { target: { files: [new File(["x"], "d.jpg", { type: "image/jpeg" })] } });

    await waitFor(() =>
      expect(onPhotoChange).toHaveBeenCalledWith({
        dataUrl: "data:image/jpeg;base64,AAA",
        width: 800,
        height: 600,
      }),
    );
  });

  it("opens on the photo when one was uploaded, and lets the student go back to drawing", () => {
    const onPhotoChange = vi.fn();
    renderWithI18n(
      <DrawDiagramResponder
        strokes={[]}
        photo={photo}
        disabled={false}
        config={{}}
        onChange={vi.fn()}
        onPhotoChange={onPhotoChange}
      />,
    );

    expect(screen.getByRole("button", { name: "Upload a photo" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "Draw" }));
    expect(screen.getByTestId("student-draw-photo-notice")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove photo and draw" }));
    expect(onPhotoChange).toHaveBeenCalledWith(null);
  });

  it("keeps the question image visible when the canvas is hidden", () => {
    renderWithI18n(
      <DrawDiagramResponder
        strokes={[]}
        photo={photo}
        disabled={false}
        config={{}}
        backgroundImageUrl="https://example.com/q.png"
        onChange={vi.fn()}
        onPhotoChange={vi.fn()}
      />,
    );
    expect(screen.getByAltText(/question image|image/i)).toHaveAttribute(
      "src",
      "https://example.com/q.png",
    );
  });

  it("hides the upload option when the teacher turned it off", () => {
    renderWithI18n(
      <DrawDiagramResponder
        strokes={[]}
        disabled={false}
        config={{ allowImageUpload: false }}
        onChange={vi.fn()}
        onPhotoChange={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "Upload a photo" })).toBeNull();
    expect(screen.getByTestId("student-draw-canvas")).toBeInTheDocument();
  });
});
