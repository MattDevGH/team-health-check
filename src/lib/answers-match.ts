/**
 * Whether two sets of answers say the same thing.
 *
 * Requirements: Explaining Itself 2.5
 * Property: 3 — submission is idempotent and visible
 *
 * A member pressed the button a second time on production and asked what had
 * just happened. Nothing had — the server upserts — but a page that cannot tell
 * a repeat from a revision cannot say so, and silence there reads as having
 * answered twice.
 *
 * A comparison rather than a dirty flag, because a member who changes an answer
 * and changes it back has not changed anything, and claiming otherwise would be
 * wrong in the direction that costs trust.
 */

export interface Answer {
  questionId: string;
  /** Null while a question is unanswered, which the form carries from the start. */
  score: number | null;
  /** Absent and null are the same nothing: the form holds one, the API sends the other. */
  trendIndicator?: 'improving' | 'stable' | 'declining' | null;
}

/** One comparable string per answered question, keyed by question. */
function byQuestion(answers: readonly Answer[]): Map<string, string> {
  const shape = new Map<string, string>();

  for (const answer of answers) {
    // A row with no score is a question on screen, not an answer given
    if (answer.score === null) continue;
    shape.set(answer.questionId, `${answer.score}:${answer.trendIndicator ?? 'none'}`);
  }

  return shape;
}

export function answersMatch(before: readonly Answer[], after: readonly Answer[]): boolean {
  const left = byQuestion(before);
  const right = byQuestion(after);

  if (left.size !== right.size) return false;

  for (const [questionId, shape] of left) {
    if (right.get(questionId) !== shape) return false;
  }

  return true;
}
