'use client';

/**
 * Question detail view component for the trend dashboard.
 * Requirements: 8.5, 8.7
 *
 * Displays a clickable list of questions. Clicking a question shows
 * per-session average scores and response counts.
 * Suppresses data display for sessions below the anonymity threshold
 * (fewer than 3 responses) when in anonymous mode.
 */

import { useState } from 'react';

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

/** One entry of the fixed question catalogue, from the trends response. */
interface QuestionCatalogueEntry {
  id: string;
  title: string;
  description: string;
}

interface QuestionDetailViewProps {
  sessions: SessionData[];
  /**
   * The team's question themes and the questions behind them.
   *
   * `description` is the sentence a member is actually asked. It has been in
   * the database since the first migration and was shown nowhere, so a manager
   * read a score without seeing what it was a score of.
   */
  questions?: QuestionCatalogueEntry[];
  anonymousMode: boolean;
  /** Minimum responses required to display data in anonymous mode */
  anonymityThreshold?: number;
}

const DEFAULT_ANONYMITY_THRESHOLD = 3;

export function QuestionDetailView({
  sessions,
  questions,
  anonymousMode,
  anonymityThreshold = DEFAULT_ANONYMITY_THRESHOLD,
}: QuestionDetailViewProps) {
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);

  /**
   * Every theme the team is asked about, from the catalogue where it is
   * available. Falling back to the answered ones keeps the list working
   * against a trends response that predates the catalogue.
   */
  const themes =
    questions ??
    Array.from(new Set(sessions.flatMap((s) => s.averages.map((a) => a.questionId)))).map(
      (id) => ({ id, title: formatQuestionId(id), description: '' }),
    );

  function handleQuestionClick(questionId: string) {
    setSelectedQuestionId((prev) => (prev === questionId ? null : questionId));
  }

  return (
    <div className="space-y-2">
      <h2 className="text-lg font-semibold text-gray-700 mb-3">
        Question themes
      </h2>
      <div className="space-y-1">
        {themes.map((theme) => {
          const qId = theme.id;
          const expanded = selectedQuestionId === qId;
          const panelId = `question-detail-${qId}`;

          return (
          <div key={qId}>
            <button
              type="button"
              onClick={() => handleQuestionClick(qId)}
              aria-expanded={expanded}
              aria-controls={panelId}
              className={`flex w-full items-center gap-2 text-left px-3 py-2 rounded text-sm transition-colors ${
                expanded
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              {/*
                A chevron so the row looks expandable as well as reporting
                itself as such. Hidden from assistive technology, which is told
                the same thing by aria-expanded.
              */}
              <span aria-hidden="true" className="inline-block w-4 text-base leading-none">
                {expanded ? '▾' : '▸'}
              </span>
              <span className="flex-1">{theme.title}</span>
              {/*
                The chevron alone was reported as too subtle to read as
                interactive. The words say what activating it does; assistive
                technology is told the same by aria-expanded, so this is hidden
                from it to avoid saying it twice.
              */}
              <span aria-hidden="true" className="text-xs text-gray-500">
                {expanded ? 'Hide responses' : 'Show responses'}
              </span>
            </button>

            {/*
              Rendered whether or not it is open, and hidden with the `hidden`
              attribute rather than unmounted. `aria-controls` must resolve to
              an element that exists: pointing at nothing promises a
              relationship the page does not have, which is worse than saying
              nothing. `hidden` also keeps it out of the accessibility tree and
              out of the tab order while collapsed.
            */}
            <div
              id={panelId}
              role="region"
              aria-label={theme.title}
              hidden={!expanded}
              className="mt-2 ml-3 border-l-2 border-blue-200 pl-3 space-y-2"
            >
              {expanded && (
              <>
                {/*
                  What the team was actually asked. A score is hard to interpret
                  without the question behind it.
                */}
                {theme.description && (
                  <p className="pb-1 text-sm italic text-gray-600">{theme.description}</p>
                )}
                {sessions.map((session) => {
                  const avg = session.averages.find((a) => a.questionId === qId);

                  // A session where nobody answered this theme used to be
                  // skipped, so the history silently omitted it and a reader
                  // could not tell a gap from a check that never ran
                  const isSuppressed =
                    avg !== undefined &&
                    anonymousMode &&
                    avg.responseCount < anonymityThreshold;

                  return (
                    <div
                      key={session.sessionId}
                      className="flex items-center justify-between text-sm py-1"
                    >
                      <span className="text-gray-500">
                        {formatDate(session.closedAt)}
                      </span>
                      {avg === undefined ? (
                        // Distinct from suppression on purpose: nobody
                        // answered, rather than too few answering to show
                        <span className="text-gray-500">No responses</span>
                      ) : isSuppressed ? (
                        <span className="text-amber-600 italic">
                          Insufficient data
                        </span>
                      ) : (
                        <span className="flex gap-3">
                          <span className="font-medium text-gray-800">
                            {avg.averageScore.toFixed(1)}
                          </span>
                          <span className="text-gray-500">
                            {pluralise(avg.responseCount, 'response')}
                          </span>
                        </span>
                      )}
                    </div>
                  );
                })}
              </>
              )}
            </div>
          </div>
          );
        })}
      </div>
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

/** Formats an ISO date string to a short date like "Jan 8" */
function formatDate(isoString: string): string {
  const date = new Date(isoString);
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return `${months[date.getMonth()]} ${date.getDate()}`;
}
