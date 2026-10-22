import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ImportExamModal } from "@/components/dashboard/ImportExamModal";
import { renderWithI18n } from "@/lib/test/render-i18n";

function renderModal(overrides: Partial<Parameters<typeof ImportExamModal>[0]> = {}) {
  const onImport = vi.fn();
  renderWithI18n(
    <ImportExamModal open importing={false} onClose={vi.fn()} onImport={onImport} {...overrides} />,
  );
  // The drop zone lives on the Upload tab; Paste is the default.
  fireEvent.click(screen.getByRole("tab", { name: /upload a file/i }));
  return { onImport, zone: screen.getByRole("button", { name: /drag your exam file here/i }) };
}

function dataTransfer(files: File[]) {
  return { files, types: ["Files"], dropEffect: "none" };
}

const examFile = () => new File(['{"questions":[]}'], "exam.json", { type: "application/json" });

describe("ImportExamModal drag and drop", () => {
  it("highlights while a file is dragged over and resets on leave", () => {
    const { zone } = renderModal();

    fireEvent.dragEnter(zone, { dataTransfer: dataTransfer([examFile()]) });
    expect(zone).toHaveAttribute("data-drag-active", "true");
    expect(zone).toHaveTextContent("Drop to add this file");

    fireEvent.dragLeave(zone, { dataTransfer: dataTransfer([]) });
    expect(zone).not.toHaveAttribute("data-drag-active");
  });

  it("selects a dropped .json file and imports it", () => {
    const { zone, onImport } = renderModal();
    const file = examFile();

    fireEvent.dragEnter(zone, { dataTransfer: dataTransfer([file]) });
    fireEvent.drop(zone, { dataTransfer: dataTransfer([file]) });

    expect(zone).toHaveTextContent("exam.json");
    expect(zone).not.toHaveAttribute("data-drag-active");

    fireEvent.click(screen.getByRole("button", { name: "Import exam" }));
    expect(onImport).toHaveBeenCalledWith({ file });
  });

  it("rejects a dropped non-JSON file with an inline error", () => {
    const { zone } = renderModal();
    const pdf = new File(["%PDF"], "notes.pdf", { type: "application/pdf" });

    fireEvent.drop(zone, { dataTransfer: dataTransfer([pdf]) });

    expect(screen.getByRole("alert")).toHaveTextContent("isn't an exam file");
    expect(screen.getByRole("button", { name: "Import exam" })).toBeDisabled();
  });

  it("ignores drops while an import is in progress", () => {
    const { zone } = renderModal({ importing: true });

    fireEvent.drop(zone, { dataTransfer: dataTransfer([examFile()]) });

    expect(zone).not.toHaveTextContent("exam.json");
  });

  it("imports pasted text from the default Paste tab and shows errors inline", () => {
    const onImport = vi.fn();
    const onClearError = vi.fn();
    renderWithI18n(
      <ImportExamModal
        open
        importing={false}
        error="We couldn't find an exam in that text."
        onClose={vi.fn()}
        onImport={onImport}
        onClearError={onClearError}
      />,
    );
    expect(screen.getByTestId("import-exam-error")).toHaveTextContent(/couldn't find an exam/i);
    const importButton = screen.getByRole("button", { name: "Import exam" });
    expect(importButton).toBeDisabled();
    fireEvent.change(screen.getByTestId("import-exam-paste"), {
      target: { value: '```json\n{"questions":[]}\n```' },
    });
    expect(onClearError).toHaveBeenCalled();
    fireEvent.click(importButton);
    expect(onImport).toHaveBeenCalledWith({ text: '```json\n{"questions":[]}\n```' });
  });
});
