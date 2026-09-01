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
}

export function TrendDistribution({ distribution }: TrendDistributionProps) {
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
