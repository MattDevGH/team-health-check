'use client';

/**
 * Latest Session panel.
 * Requirements: Manager Experience 3.5, 3.6
 *
 * Replaces a panel that listed response counts under a heading promising the
 * latest session: a manager could see that six people answered and not what
 * they said.
 *
 * Shows, per question, the score, how it moved since the previous check, and
 * how many answered. The movement is stated in words — "0.4 higher" — because
 * an arrow or a colour leaves a screen reader user with a bare number, and
 * Requirement 3.2's rule against colour-alone applies here too.
 */

import { pluralise } from '@/lib/format';

interface SessionAverage {
  questionId: string;
  averageScore: number;
  responseCount: number;
}

interface SessionData {
  sessionId: string;
  closedAt: string;
  averages: SessionAverage[];
}

/** One entry of the fixed question catalogue. */
interface QuestionCatalogueEntry {
  id: string;
  title: string;
  description: string;
}

interface LatestSessionPanelProps {
  /** Closed sessions, oldest first, as the trends endpoint returns them. */
  sessions: SessionData[];
  /**
   * The team's question themes, from the trends response.
   *
   * Without this the rows come from the aggregates, so a theme nobody answered
   * is absent rather than reported — a manager cannot tell silence from a
   * question never asked. Optional so the panel still works against a trends
   * response that predates the catalogue.
   */
  questions?: QuestionCatalogueEntry[];
  anonymousMode: boolean;
}

/** Matches the threshold the trend service and the drill-down already apply. */
const ANONYMITY_THRESHOLD = 3;

const HEADING_ID = 'latest-session-heading';

function questionName(id: string): string {
  return id
    .replace(/^q-/, '')
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function fullDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Describes movement since the previous check in words.
 *
 * Rounded to one decimal before comparison, so two scores that display
 * identically are never reported as having changed — "3.9, 0.0 higher" reads as
 * a bug even when the underlying floats differ.
 */
function describeChange(current: number, previous: number | undefined): string {
  if (previous === undefined) return 'First check for this question';

  const delta = Number((current - previous).toFixed(1));

  if (delta === 0) return 'Unchanged';
  return `${Math.abs(delta).toFixed(1)} ${delta > 0 ? 'higher' : 'lower'}`;
}

export function LatestSessionPanel({
  sessions,
  questions,
  anonymousMode,
}: LatestSessionPanelProps) {
  if (sessions.length === 0) return null;

  const latest = sessions[sessions.length - 1];
  const previous = sessions[sessions.length - 2];

  /**
   * Every theme the team is asked about, not only those with answers.
   *
   * Falls back to the answered ones when no catalogue is supplied, which keeps
   * the panel working rather than emptying it.
   */
  const rows = (questions ?? latest.averages.map(a => ({ id: a.questionId, title: questionName(a.questionId) })))
    .map(question => ({
      id: question.id,
      title: question.title,
      average: latest.averages.find(a => a.questionId === question.id),
    }));

  return (
    <section aria-labelledby={HEADING_ID} className="bg-white rounded-lg shadow p-4 mb-6">
      <h2 id={HEADING_ID} className="text-lg font-semibold text-gray-800">
        Latest session
      </h2>
      <p className="mb-3 text-sm text-gray-600">
        Closed on {fullDate(latest.closedAt)}, compared with the check before it.
      </p>

      {/*
        Focusable for the same reason as the chart's table: see trend-chart.
        Named distinctly from the section around it, so a query for the panel
        does not match this region too.
      */}
      <div role="region" aria-label="Scores by question theme" tabIndex={0} className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th scope="col" className="py-1 pr-4 font-medium text-gray-700">
                Question
              </th>
              <th scope="col" className="py-1 pr-4 font-medium text-gray-700">
                Score
              </th>
              <th scope="col" className="py-1 pr-4 font-medium text-gray-700">
                Change
              </th>
              <th scope="col" className="py-1 font-medium text-gray-700">
                Responses
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ id, title, average }) => {
              const suppressed =
                average !== undefined &&
                anonymousMode &&
                average.responseCount < ANONYMITY_THRESHOLD;
              const previousScore = previous?.averages.find(
                a => a.questionId === id,
              )?.averageScore;

              return (
                <tr key={id} className="border-t border-gray-200">
                  <th scope="row" className="py-1 pr-4 font-normal text-gray-800">
                    {title}
                  </th>

                  {average === undefined ? (
                    // Nobody answered. Deliberately worded differently from
                    // suppression: one means silence, the other means people
                    // answered and there were too few to show safely.
                    <td colSpan={3} className="py-1 text-gray-500">
                      No responses
                    </td>
                  ) : suppressed ? (
                    // Said plainly rather than left blank: a gap reads as
                    // missing data, when in fact the team is too small for this
                    // answer to stay anonymous
                    <td colSpan={3} className="py-1 italic text-amber-700">
                      Hidden until {ANONYMITY_THRESHOLD} people have answered
                    </td>
                  ) : (
                    <>
                      <td className="py-1 pr-4 font-medium text-gray-900">
                        {average.averageScore.toFixed(1)}
                      </td>
                      <td className="py-1 pr-4 text-gray-700">
                        {describeChange(average.averageScore, previousScore)}
                      </td>
                      <td className="py-1 text-gray-600">
                        {pluralise(average.responseCount, 'response')}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
