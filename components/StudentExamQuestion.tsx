"use client";

import type { ReactNode } from "react";

import { RaiseHandButton } from "@/components/RaiseHandButton";
import { StudentResponseDispatcher } from "@/components/response-types/StudentResponseDispatcher";
import type { Question } from "@/lib/forms";
import type { TeacherFeedbackStore } from "@/lib/response-types/feedback";

type Props = {
  question: Question;
  index: number;
  answer: string | undefined;
  answered: boolean;
  examActive: boolean;
  disabled: boolean;
  protectTextarea: boolean;
  showLiveFeedbackFeature: boolean;
  feedbackStore: TeacherFeedbackStore;
  showRaiseHand?: boolean;
  handRaised?: boolean;
  raiseHandBusy?: boolean;
  showSavedTick?: boolean;
  onToggleRaiseHand?: () => void;
  /** Fires when the student focuses anywhere in this question (for teacher live chip). */
  onFocusQuestion?: () => void;
  onChoiceChange: (value: string) => void;
  onTextChange: (value: string) => void;
};

export function StudentExamQuestion({
  question,
  index,
  answer,
  answered,
  examActive,
  disabled,
  protectTextarea,
  showLiveFeedbackFeature,
  feedbackStore,
  showRaiseHand = false,
  handRaised = false,
  raiseHandBusy = false,
  showSavedTick = false,
  onToggleRaiseHand,
  onFocusQuestion,
  onChoiceChange,
  onTextChange,
}: Props) {
  const raiseHandExtra: ReactNode =
    showRaiseHand && onToggleRaiseHand ? (
      <RaiseHandButton
        raised={handRaised}
        disabled={disabled}
        busy={raiseHandBusy}
        onToggle={onToggleRaiseHand}
      />
    ) : null;

  return (
    <div
      className={`tp-exam-q${handRaised ? " tp-exam-q--hand-raised" : ""}`}
      onFocusCapture={onFocusQuestion}
    >
      <StudentResponseDispatcher
        question={question}
        index={index}
        answer={answer}
        answered={answered}
        examActive={examActive}
        disabled={disabled}
        protectTextarea={protectTextarea}
        showLiveFeedbackFeature={showLiveFeedbackFeature}
        feedbackStore={feedbackStore}
        showSavedTick={showSavedTick}
        headerExtra={raiseHandExtra}
        onAnswerChange={onTextChange}
        onChoiceChange={onChoiceChange}
      />
    </div>
  );
}
