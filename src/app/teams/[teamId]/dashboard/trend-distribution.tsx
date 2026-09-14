/**
 * Trend indicator distribution display component.
 * Requirement: 8.4
 *
 * Shows improving/stable/declining counts for each question
 * in the most recent closed session.
 */

interface TrendDistributionData {
  questionId: string;
  improving: number;
  stable: number;
  declining: number;
}

interface TrendDistributionProps {
  distribution: TrendDistributionData[];
  /** Whether the team was promised that individual answers stay unattributable. */
  anonymousMode: boolean;
  /** Minimum voices before a count may be shown. */
  anonymityThreshold?: number;
}

const DEFAULT_ANONYMITY_THRESHOLD = 3;

export function TrendDistribution({
  distribution,
  anonymousMode,
  anonymityThreshold = DEFAULT_ANONYMITY_THRESHOLD,
}: TrendDistributionProps) {
  /**
   * A trend indicator identifies a person exactly as a score does.
   *
   * Production showed every score hidden behind "fewer than 3 people
   * answered" and `Stable: 1` beside it, which told any reader what that one
   * person said. Protecting one and not the other makes the protection
   * theatre: in a team of three where two have not answered, `Declining: 1`
   * is attributable by elimination.
   *
   * Counted across all three words rather than per word. The identifying
   * quantity is how many people expressed a trend at all — and a trend is
   * optional alongside a score, so this total is not the response count.
   */
  const isSuppressed = (item: TrendDistributionData) =>
    anonymousMode && item.improving + item.stable + item.declining < anonymityThreshold;
  return (
    <div className="space-y-3">
      {/*
        These counts are frequently misread as a calculated trend. They are not:
        each is the number of people who chose that word themselves.
      */}
      <p className="text-sm text-gray-600">
        Alongside a score, each person can say whether they feel a theme is
        improving, stable or declining. These are counts of what people chose —
        not a trend calculated from the scores.
      </p>
      {distribution.map((item) => (
        <div key={item.questionId} className="border-b border-gray-100 pb-2 last:border-b-0">
          <p className="text-sm font-medium text-gray-700 mb-1">
            {formatQuestionId(item.questionId)}
          </p>
          {isSuppressed(item) ? (
            /*
              Named and explained rather than omitted. An absent row reads as
              "nobody answered", which is a different and false claim —
              hidden is not the same as unanswered.
            */
            <p className="text-xs italic text-amber-800">
              Hidden — fewer than {anonymityThreshold} people said how this is going
            </p>
          ) : (
            <div className="flex gap-4 text-xs">
              <span className="text-green-700">
                Improving: {item.improving}
              </span>
              <span className="text-gray-600">
                Stable: {item.stable}
              </span>
              <span className="text-red-600">
                Declining: {item.declining}
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** Converts a question ID like "q-delivering-value" to "Delivering Value" */
function formatQuestionId(id: string): string {
  return id
    .replace(/^q-/, '')
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
