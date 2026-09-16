/**
 * Why a tick passed a team over.
 *
 * Requirements: Knowing What Happened 1.3, 1.6
 *
 * One list, shared by the scheduler that records these and the summary that
 * reads them out. The reason is the whole content of a quiet tick — `opened: 0`
 * is the correct outcome on a Wednesday and a failure on Monday at 15:30, and
 * only the reason tells them apart — so a reason added in one place and missing
 * from the other should not compile.
 */

export const SKIP_REASONS = [
  'team archived',
  'no schedule configured',
  'outside the collection window',
  'this cycle has already been served',
  'a check is already collecting',
] as const;

export type SkipReason = (typeof SKIP_REASONS)[number];

/**
 * How each reason reads after a count, as in "2 teams already collecting".
 *
 * The reasons above were written to stand alone in a log line, and pasting a
 * number in front of one is not a phrase: the first version of the summary
 * said "Passed over 2 a check is already collecting."
 */
export const SKIP_PHRASES: Record<SkipReason, string> = {
  'team archived': 'archived',
  'no schedule configured': 'with no schedule configured',
  'outside the collection window': 'outside the collection window',
  'this cycle has already been served': 'already served this cycle',
  'a check is already collecting': 'already collecting',
};
