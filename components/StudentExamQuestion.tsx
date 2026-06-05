"use client";

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
  onChoiceChange,
  onTextChange,
}: Props) {
  return (
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
  );
}
