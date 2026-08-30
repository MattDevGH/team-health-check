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

interface QuestionDetailViewProps {
  sessions: SessionData[];
  anonymousMode: boolean;
  /** Minimum responses required to display data in anonymous mode */
  anonymityThreshold?: number;
}

const DEFAULT_ANONYMITY_THRESHOLD = 3;

export function QuestionDetailView({
  sessions,
  anonymousMode,
  anonymityThreshold = DEFAULT_ANONYMITY_THRESHOLD,
}: QuestionDetailViewProps) {
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);

  // Collect unique question IDs across all sessions
  const questionIds = Array.from(
    new Set(sessions.flatMap((s) => s.averages.map((a) => a.questionId)))
  );

  function handleQuestionClick(questionId: string) {
    setSelectedQuestionId((prev) => (prev === questionId ? null : questionId));
  }

  return (
    <div className="space-y-2">
      <h2 className="text-lg font-semibold text-gray-700 mb-3">
        Questions
      </h2>
      <div className="space-y-1">
        {questionIds.map((qId) => (
          <div key={qId}>
            <button
              type="button"
              onClick={() => handleQuestionClick(qId)}
              className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                selectedQuestionId === qId
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              {formatQuestionId(qId)}
            </button>

            {selectedQuestionId === qId && (
              <div className="mt-2 ml-3 border-l-2 border-blue-200 pl-3 space-y-2">
                {sessions.map((session) => {
                  const avg = session.averages.find((a) => a.questionId === qId);
                  if (!avg) return null;

                  const isSuppressed =
                    anonymousMode && avg.responseCount < anonymityThreshold;

                  return (
                    <div
                      key={session.sessionId}
                      className="flex items-center justify-between text-sm py-1"
                    >
                      <span className="text-gray-500">
                        {formatDate(session.closedAt)}
                      </span>
                      {isSuppressed ? (
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
              </div>
            )}
          </div>
        ))}
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
