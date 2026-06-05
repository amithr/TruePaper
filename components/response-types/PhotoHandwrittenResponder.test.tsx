import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PhotoHandwrittenResponder } from "@/components/response-types/PhotoHandwrittenResponder";
import { renderWithI18n } from "@/lib/test/render-i18n";

vi.mock("@/lib/image-compress", () => ({
  compressImageFile: vi.fn(),
}));

describe("PhotoHandwrittenResponder", () => {
  it("renders upload control when no image", () => {
    renderWithI18n(
      <PhotoHandwrittenResponder
        imageDataUrl=""
        width={0}
        height={0}
        disabled={false}
        config={{ maxDimension: 960 }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId("student-photo-upload")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /upload/i })).toBeInTheDocument();
  });
});
