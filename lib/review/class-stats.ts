import type { Question } from "@/lib/forms";
import { isResponseAnswered, parseResponseValue } from "@/lib/response-types/answers";
import { autogradeEarnedPoints, hasAutogradeKey } from "@/lib/response-types/autograde";
import { normalizeResponseType } from "@/lib/response-types/types";

/** The slice of a student the stats need; never a name. */
export type ReviewStudent = {
  finished: boolean;
  answers: Record<string, string>;
};

export type OptionShare = { label: string; count: number; pct: number; correct: boolean };

/** Anonymous, class-wide view of one question — what the projector may show. */
export type QuestionClassStats =
  | { kind: "choices"; n: number; answered: number; options: OptionShare[] }
  | {
      kind: "text";
      n: number;
      answered: number;
      /** null when there is no key to mark against */
      correct: number | null;
      common: { text: string; count: number }[];
    }
  | { kind: "credit"; n: number; answered: number; averagePct: number; fullMarks: number }
  | { kind: "answered"; n: number; answered: number };

/** Students who handed in; if nobody has yet, anyone who answered anything. */
export function studentsForReview<T extends ReviewStudent>(students: T[]): T[] {
  const finished = students.filter((s) => s.finished);
  if (finished.length > 0) {
    return finished;
  }
  return students.filter((s) => Object.values(s.answers).some((a) => a && a.trim().length > 0));
}

function normalizeText(text: string, caseSensitive: boolean): string {
  const t = text.trim().replace(/\s+/g, " ");
  return caseSensitive ? t : t.toLowerCase();
}

export function questionClassStats(question: Question, students: ReviewStudent[]): QuestionClassStats {
  const type = normalizeResponseType(question.type);
  const n = students.length;
  const raws = students.map((s) => s.answers[question.id]);
  const answeredRaws = raws.filter((raw): raw is string => isResponseAnswered(type, raw));
  const answered = answeredRaws.length;
  const keyed = hasAutogradeKey(question);
  const maxPts = Math.max(1, Math.floor(Number(question.points) || 1));

  if (type === "multipleChoice" || type === "trueFalse") {
    const labels =
      type === "multipleChoice"
        ? question.options.map((o, i) => o || `Option ${i + 1}`)
        : ["true", "false"];
    const counts = new Map<string, number>(labels.map((l) => [l, 0]));
    for (const raw of answeredRaws) {
      const value = parseResponseValue(type, raw);
      const picked =
        value.type === "multipleChoice" ? value.choice : value.type === "trueFalse" && value.answer !== null ? String(value.answer) : "";
      if (counts.has(picked)) {
        counts.set(picked, (counts.get(picked) ?? 0) + 1);
      }
    }
    const correctLabel =
      type === "multipleChoice"
        ? question.correctAnswer?.trim() ?? ""
        : keyed
          ? String((question.responseConfig as { correctAnswer?: boolean }).correctAnswer)
          : "";
    return {
      kind: "choices",
      n,
      answered,
      options: labels.map((label) => {
        const count = counts.get(label) ?? 0;
        return { label, count, pct: answered > 0 ? Math.round((count / answered) * 100) : 0, correct: keyed && label === correctLabel };
      }),
    };
  }

  if (type === "shortAnswer" || type === "mathInput") {
    const caseSensitive = (question.responseConfig as { caseSensitive?: boolean }).caseSensitive === true;
    const tally = new Map<string, { text: string; count: number }>();
    let correct = 0;
    for (const raw of answeredRaws) {
      const value = parseResponseValue(type, raw);
      const text = value.type === "shortAnswer" ? value.text : value.type === "mathInput" ? value.answer : "";
      if (!text.trim()) {
        continue;
      }
      const key = normalizeText(text, caseSensitive);
      const entry = tally.get(key) ?? { text: text.trim(), count: 0 };
      entry.count += 1;
      tally.set(key, entry);
      if (keyed && autogradeEarnedPoints(question, raw) > 0) {
        correct += 1;
      }
    }
    const common = [...tally.values()].sort((a, b) => b.count - a.count).slice(0, 3);
    return { kind: "text", n, answered, correct: keyed ? correct : null, common };
  }

  if ((type === "matching" || type === "ordering" || type === "labelling") && keyed) {
    let creditSum = 0;
    let fullMarks = 0;
    for (const raw of answeredRaws) {
      const earned = autogradeEarnedPoints(question, raw);
      creditSum += earned / maxPts;
      if (earned >= maxPts) {
        fullMarks += 1;
      }
    }
    return {
      kind: "credit",
      n,
      answered,
      averagePct: answered > 0 ? Math.round((creditSum / answered) * 100) : 0,
      fullMarks,
    };
  }

  return { kind: "answered", n, answered };
}
