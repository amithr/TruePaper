"use client";

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
  onToggleRaiseHand?: () => void;
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
  onToggleRaiseHand,
  onChoiceChange,
  onTextChange,
}: Props) {
  return (
    <div className="space-y-2">
      {showRaiseHand && onToggleRaiseHand ? (
        <div className="flex justify-end">
          <RaiseHandButton
            raised={handRaised}
            disabled={disabled}
            busy={raiseHandBusy}
            onToggle={onToggleRaiseHand}
          />
        </div>
      ) : null}
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
        onAnswerChange={onTextChange}
        onChoiceChange={onChoiceChange}
      />
    </div>
  );
}
