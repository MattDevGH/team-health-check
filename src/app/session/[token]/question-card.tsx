'use client';

/**
 * QuestionCard — renders a single health check question with score and trend inputs.
 * Requirements: 4.1, 4.3, 4.8
 *
 * Score: radio group 1-5
 * Trend indicator: optional radio group (improving/stable/declining)
 * Pre-populates from existing responses.
 */

import { useState } from 'react';

interface QuestionData {
  id: string;
  title: string;
  description: string;
  displayOrder: number;
}

interface ResponseData {
  questionId: string;
  score: number;
  trendIndicator: string | null;
}

interface QuestionCardProps {
  question: QuestionData;
  existingResponse: ResponseData | null;
}

const SCORES = [1, 2, 3, 4, 5] as const;
const TREND_OPTIONS = [
  { value: 'improving', label: 'Improving' },
  { value: 'stable', label: 'Stable' },
  { value: 'declining', label: 'Declining' },
] as const;

export function QuestionCard({ question, existingResponse }: QuestionCardProps) {
  const [score, setScore] = useState<number | null>(existingResponse?.score ?? null);
  const [trend, setTrend] = useState<string | null>(existingResponse?.trendIndicator ?? null);

  const scoreGroupId = `${question.id}-score`;
  const trendGroupId = `${question.id}-trend`;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <h2 className="text-base font-semibold text-gray-800 mb-1">
        {question.title}
      </h2>
      <p className="text-sm text-gray-500 mb-3">{question.description}</p>

      {/* Score input */}
      <div role="group" aria-label={`${question.title} score`}>
        <p className="text-sm font-medium text-gray-700 mb-2">Score</p>
        <div className="flex gap-2">
          {SCORES.map(value => (
            <label
              key={value}
              className={`flex items-center justify-center w-10 h-10 rounded-full border-2 cursor-pointer text-sm font-medium transition-colors ${
                score === value
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'border-gray-300 bg-white text-gray-700 hover:border-blue-400'
              }`}
            >
              <input
                type="radio"
                name={scoreGroupId}
                value={value}
                checked={score === value}
                onChange={() => setScore(value)}
                className="sr-only"
              />
              {value}
            </label>
          ))}
        </div>
      </div>

      {/* Trend indicator */}
      <div role="group" aria-label={`${question.title} trend`} className="mt-3">
        <p className="text-xs font-medium text-gray-500 mb-1">Trend (optional)</p>
        <div className="flex gap-2">
          {TREND_OPTIONS.map(option => (
            <label
              key={option.value}
              className={`px-3 py-1 rounded-full text-xs cursor-pointer border transition-colors ${
                trend === option.value
                  ? 'border-blue-600 bg-blue-50 text-blue-700'
                  : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-400'
              }`}
            >
              <input
                type="radio"
                name={trendGroupId}
                value={option.value}
                checked={trend === option.value}
                onChange={() => setTrend(option.value)}
                className="sr-only"
              />
              {option.label}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
