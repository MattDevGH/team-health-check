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
import { materialisationEvidence, resultState } from './result-state';

interface SessionAverage {
  questionId: string;
  averageScore: number;
  responseCount: number;
}

interface SessionData {
  sessionId: string;
  closedAt: string;
  /** When aggregates were computed. Null means never — not the same as empty. */
  materialisedAt?: string | null;
  averages: SessionAverage[];
}

/** One entry of the fixed question catalogue. */
interface QuestionCatalogueEntry {
  id: string;
  title: string;
  description: string;
}

interface LatestSessionPanelProps {
  /** Injectable so "being prepared" versus "overdue" is testable without waiting. */
  now?: Date;
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
  if (previous === undefined) return 'First check for this theme';

  const delta = Number((current - previous).toFixed(1));

  if (delta === 0) return 'Unchanged';
  return `${Math.abs(delta).toFixed(1)} ${delta > 0 ? 'higher' : 'lower'}`;
}

export function LatestSessionPanel({
  sessions,
  questions,
  anonymousMode,
  now = new Date(),
}: LatestSessionPanelProps) {
  if (sessions.length === 0) return null;

  const latest = sessions[sessions.length - 1];
  const previous = sessions[sessions.length - 2];

  // Derived once for the session rather than per row, so no two themes can
  // disagree about whether the session was ever materialised.
  const materialisedAt = materialisationEvidence({
    materialisedAt: latest.materialisedAt ?? null,
    closedAt: latest.closedAt,
    averages: latest.averages,
  });
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
                Question theme
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
              // One selector decides all four outcomes, so the panel and the
              // themes list cannot drift into disagreeing about the same data.
              const state = resultState({
                average,
                materialisedAt: materialisedAt,
                closedAt: latest.closedAt,
                now,
                anonymousMode,
                anonymityThreshold: ANONYMITY_THRESHOLD,
              });
              const previousScore = previous?.averages.find(
                a => a.questionId === id,
              )?.averageScore;

              return (
                <tr key={id} className="border-t border-gray-200">
                  <th scope="row" className="py-1 pr-4 font-normal text-gray-800">
                    {title}
                  </th>

                  {/*
                    Four reasons a cell can be empty, and they are different news.

                    Being prepared resolves in minutes. Overdue means the
                    scheduler has stopped. Hidden never resolves without more
                    people. And no responses means silence. Rendering all four as
                    blankness is how a working tool came to look broken.
                  */}
                  {state.kind === 'pending' ? (
                    <td colSpan={3} className="py-1 italic text-gray-600">
                      Results are being prepared — this usually takes a few minutes
                    </td>
                  ) : state.kind === 'overdue' ? (
                    /*
                      Not "nobody answered". That would be a false claim about a
                      team, on a tool whose purpose is telling you how they are
                      doing — and the truth is that nothing has computed them.
                    */
                    <td colSpan={3} className="py-1 italic text-amber-800">
                      Results are overdue — the scheduler may not be running
                    </td>
                  ) : state.kind === 'unanswered' ? (
                    // Silence, distinct from suppression: one means nobody spoke,
                    // the other means too few did to show it safely.
                    <td colSpan={3} className="py-1 text-gray-500">
                      No responses
                    </td>
                  ) : state.kind === 'suppressed' ? (
                    <td colSpan={3} className="py-1 italic text-amber-800">
                      Hidden until {state.needed} people have answered
                    </td>
                  ) : (
                    <>
                      <td className="py-1 pr-4 font-medium text-gray-900">
                        {state.average.averageScore.toFixed(1)}
                      </td>
                      <td className="py-1 pr-4 text-gray-700">
                        {describeChange(state.average.averageScore, previousScore)}
                      </td>
                      <td className="py-1 text-gray-600">
                        {pluralise(state.average.responseCount, 'response')}
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
