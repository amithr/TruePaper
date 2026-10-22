import type { Question } from "@/lib/forms";
import { annotatePassageText, parseResponseConfig } from "@/lib/response-types/registry";

/**
 * Pasted / typed text that is clearly a source to annotate (an article, extract,
 * speech) rather than a one-line instruction.
 */
export function looksLikeSourceText(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length >= 200 || (trimmed.includes("\n") && trimmed.length >= 80);
}

/** True when an annotate question has no passage but its question text is the source. */
export function promptLooksLikeMisplacedSource(question: Question): boolean {
  return (
    question.type === "annotateSource" &&
    !annotatePassageText(question.responseConfig).trim() &&
    looksLikeSourceText(question.prompt)
  );
}

export function withAnnotatePassage(question: Question, passageText: string): Question {
  return {
    ...question,
    responseConfig: {
      ...parseResponseConfig(question.type, question.responseConfig),
      passageText,
    },
  };
}

/**
 * Move the question text into the passage (students can only highlight the passage)
 * and replace the question text with a short instruction.
 */
export function moveQuestionTextToPassage(question: Question, instruction: string): Question {
  return { ...withAnnotatePassage(question, question.prompt.trim()), prompt: instruction };
}
