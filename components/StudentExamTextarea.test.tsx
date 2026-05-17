import { useRef, useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { StudentExamTextarea } from "@/components/StudentExamTextarea";
import { mergeStudentAnswersForSave } from "@/lib/collect-student-exam-answers";
import type { Question } from "@/lib/forms";
import { stableStringifyStudentAnswers } from "@/lib/student-answers-json";

const textQuestion: Question = {
  id: "q-essay",
  prompt: "Essay",
  type: "text",
  options: [],
  correctAnswer: null,
  points: 1,
  displayOrder: 0,
};

/** Minimal harness mirroring controlled exam state + autosave without wiping the field. */
function ControlledExamHarness() {
  const formRef = useRef<HTMLFormElement>(null);
  const [examAnswers, setExamAnswers] = useState<Record<string, string>>({ "q-essay": "" });
  const [saveCount, setSaveCount] = useState(0);
  const [lastPersisted, setLastPersisted] = useState("");
  const [, setNowTick] = useState(0);

  const runAutosave = () => {
    const merged = mergeStudentAnswersForSave(examAnswers, formRef.current, [textQuestion]);
    setLastPersisted(stableStringifyStudentAnswers(merged));
    setSaveCount((n) => n + 1);
    setNowTick((t) => t + 1);
  };

  return (
    <div>
      <form ref={formRef} data-testid="exam-form">
        <StudentExamTextarea
          id="q-essay"
          value={examAnswers["q-essay"] ?? ""}
          protect={false}
          onValueChange={(next) => {
            setExamAnswers((prev) => ({ ...prev, "q-essay": next }));
          }}
        />
      </form>
      <button type="button" onClick={runAutosave}>
        Autosave
      </button>
      <p data-testid="save-count">{saveCount}</p>
      <p data-testid="last-persisted">{lastPersisted}</p>
    </div>
  );
}

describe("StudentExamTextarea", () => {
  afterEach(() => {
    cleanup();
  });

  it("keeps the full typed response after autosave re-renders (controlled value unchanged)", async () => {
    const user = userEvent.setup();
    render(<ControlledExamHarness />);

    const field = screen.getByRole("textbox");
    const fullText =
      "Students must be able to write long responses without losing text when autosave runs.";

    await user.click(field);
    await user.type(field, fullText);

    expect(field).toHaveValue(fullText);

    await user.click(screen.getByRole("button", { name: "Autosave" }));

    expect(screen.getByTestId("save-count")).toHaveTextContent("1");
    expect(field).toHaveValue(fullText);
    expect(screen.getByTestId("last-persisted")).toHaveTextContent(
      JSON.stringify({ "q-essay": fullText }),
    );
  });

  it("accepts Playwright fill via change event when protect is on", () => {
    function ProtectedHarness() {
      const [value, setValue] = useState("");
      return (
        <StudentExamTextarea
          id="q-essay"
          value={value}
          protect
          onValueChange={setValue}
        />
      );
    }

    render(<ProtectedHarness />);
    const field = screen.getByRole("textbox") as HTMLTextAreaElement;
    const longText =
      "E2E autosave check: students must keep the full essay visible while saves run. " +
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(4);

    fireEvent.change(field, { target: { value: longText } });

    expect(field).toHaveValue(longText);
  });

  it("accepts Playwright-style first fill (insertReplacementText) when protect is on", () => {
    function ProtectedHarness() {
      const [value, setValue] = useState("");
      return (
        <StudentExamTextarea
          id="q-essay"
          value={value}
          protect
          onValueChange={setValue}
        />
      );
    }

    render(<ProtectedHarness />);
    const field = screen.getByRole("textbox") as HTMLTextAreaElement;
    const longText =
      "E2E autosave check: students must keep the full essay visible while saves run. " +
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(4);

    field.value = longText;
    field.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        inputType: "insertReplacementText",
      }),
    );

    expect(field).toHaveValue(longText);
  });

  it("accepts the first long answer when protect is on (empty field → essay)", async () => {
    const user = userEvent.setup();
    const fullText =
      "E2E autosave check: students must keep the full essay visible while saves run. " +
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(4);

    function ProtectedHarness() {
      const [value, setValue] = useState("");
      return (
        <StudentExamTextarea
          id="q-essay"
          value={value}
          protect
          onValueChange={setValue}
        />
      );
    }

    render(<ProtectedHarness />);
    const field = screen.getByRole("textbox");
    await user.click(field);
    await user.type(field, fullText);
    expect(field).toHaveValue(fullText);
  });

  it("does not clear when parent re-renders with the same controlled value", async () => {
    const user = userEvent.setup();

    function Wrapper() {
      const [value, setValue] = useState("");
      const [tick, setTick] = useState(0);
      return (
        <div>
          <StudentExamTextarea
            id="q1"
            value={value}
            protect={false}
            onValueChange={setValue}
          />
          <button type="button" onClick={() => setTick((t) => t + 1)}>
            Re-render {tick}
          </button>
        </div>
      );
    }

    render(<Wrapper />);
    const field = document.getElementById("q1") as HTMLTextAreaElement;
    expect(field).toBeTruthy();
    await user.type(field, "Still here after parent re-render");
    await user.click(screen.getByRole("button", { name: /Re-render/ }));
    expect(field).toHaveValue("Still here after parent re-render");
  });
});
