/**
 * Telling a changed answer from an unchanged one.
 *
 * Requirements: Explaining Itself 2.5
 * Property: 3 — submission is idempotent and visible
 *
 * A member pressed the button a second time on production and asked what had
 * just happened. Nothing had: the same answers went to a server that upserts
 * them. But "nothing happened" is only reassuring if the page says so, and it
 * can only say so if it can tell.
 *
 * Deliberately a pure comparison rather than a flag the form sets when a radio
 * changes. A member who changes an answer and changes it back has not changed
 * anything, and a page claiming otherwise would be wrong in the direction that
 * costs trust.
 */

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { answersMatch, type Answer } from './answers-match';

const answer = (questionId: string, score: number, trendIndicator?: Answer['trendIndicator']): Answer => ({
  questionId,
  score,
  trendIndicator,
});

describe('answersMatch', () => {
  it('matches a list against itself', () => {
    const answers = [answer('q1', 3, 'stable'), answer('q2', 4)];

    expect(answersMatch(answers, answers)).toBe(true);
  });

  it('does not match when a score changed', () => {
    expect(answersMatch([answer('q1', 3)], [answer('q1', 4)])).toBe(false);
  });

  it('does not match when a trend changed, which is an answer too', () => {
    expect(answersMatch([answer('q1', 3, 'stable')], [answer('q1', 3, 'improving')])).toBe(false);
  });

  it('does not match when a trend was cleared', () => {
    expect(answersMatch([answer('q1', 3, 'stable')], [answer('q1', 3)])).toBe(false);
  });

  it('treats an absent trend and a null one as the same nothing', () => {
    // The link context sends null; the form holds undefined. Same fact.
    const fromServer = [{ questionId: 'q1', score: 3, trendIndicator: null }];

    expect(answersMatch(fromServer, [answer('q1', 3)])).toBe(true);
  });

  it('ignores the order they arrive in', () => {
    const before = [answer('q1', 3), answer('q2', 5)];
    const after = [answer('q2', 5), answer('q1', 3)];

    expect(answersMatch(before, after)).toBe(true);
  });

  it('does not match when an answer was added', () => {
    expect(answersMatch([answer('q1', 3)], [answer('q1', 3), answer('q2', 2)])).toBe(false);
  });

  it('does not match when an answer was withdrawn', () => {
    expect(answersMatch([answer('q1', 3), answer('q2', 2)], [answer('q1', 3)])).toBe(false);
  });

  it('matches two empty lists, since nothing is the same as nothing', () => {
    expect(answersMatch([], [])).toBe(true);
  });

  it('ignores answers with no score, which are not answers', () => {
    // The form carries a row per question from the moment it renders
    const withBlank = [answer('q1', 3), { questionId: 'q2', score: null }];

    expect(answersMatch(withBlank, [answer('q1', 3)])).toBe(true);
  });
});

/** Generates a set of answers with distinct question ids. */
const answersArbitrary = fc
  .uniqueArray(
    fc.record({
      questionId: fc.string({ minLength: 1, maxLength: 8 }),
      score: fc.integer({ min: 1, max: 5 }),
      trendIndicator: fc.constantFrom(undefined, 'improving' as const, 'stable' as const, 'declining' as const),
    }),
    { selector: (a) => a.questionId, maxLength: 6 },
  );

describe('answersMatch properties', () => {
  it('matches any list against a shuffle of itself', () => {
    fc.assert(
      fc.property(answersArbitrary, (answers) => {
        const shuffled = [...answers].reverse();
        expect(answersMatch(answers, shuffled)).toBe(true);
      }),
    );
  });

  it('never matches when exactly one score is moved', () => {
    fc.assert(
      fc.property(
        answersArbitrary.filter((a) => a.length > 0),
        fc.nat(),
        (answers, index) => {
          const target = index % answers.length;
          const changed = answers.map((a, i) =>
            i === target ? { ...a, score: (a.score % 5) + 1 } : a,
          );

          expect(answersMatch(answers, changed)).toBe(false);
        },
      ),
    );
  });

  it('is symmetric, so neither side is privileged', () => {
    fc.assert(
      fc.property(answersArbitrary, answersArbitrary, (a, b) => {
        expect(answersMatch(a, b)).toBe(answersMatch(b, a));
      }),
    );
  });
});
