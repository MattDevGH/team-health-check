'use client';

import { useState, useCallback } from 'react';

import type {
  FeedbackFormProps,
  ResponseInput,
  TrendIndicator,
  ValidationError,
} from './types';

/**
 * Reusable feedback form component for health check responses.
 * Renders score inputs (1-5) and optional trend indicators per question.
 * Mobile-friendly from 320px width with no horizontal scrolling.
 *
 * Validates: Requirements 4.3, 4.5, 4.7, 4.10
 */
export function FeedbackForm({
  questions,
  initialResponses,
  onSubmit,
  isSubmitting = false,
}: FeedbackFormProps) {
  const [responses, setResponses] = useState<ResponseInput[]>(() =>
    questions.map((q) => {
      const existing = initialResponses?.find((r) => r.questionId === q.id);
      return {
        questionId: q.id,
        score: existing?.score ?? null,
        trendIndicator: existing?.trendIndicator,
      };
    })
  );

  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const setScore = useCallback((questionId: string, score: number) => {
    setResponses((prev) =>
      prev.map((r) => (r.questionId === questionId ? { ...r, score } : r))
    );
    setErrors((prev) => prev.filter((e) => e.questionId !== questionId));
  }, []);

  const setTrend = useCallback((questionId: string, trendIndicator: TrendIndicator) => {
    setResponses((prev) =>
      prev.map((r) => (r.questionId === questionId ? { ...r, trendIndicator } : r))
    );
  }, []);

  const validate = (): boolean => {
    const newErrors: ValidationError[] = [];
    for (const r of responses) {
      if (r.score === null) {
        const question = questions.find((q) => q.id === r.questionId);
        newErrors.push({
          questionId: r.questionId,
          message: `Please select a score for ${question?.title ?? 'this question'}`,
        });
      }
    }
    setErrors(newErrors);
    return newErrors.length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!validate()) return;

    try {
      await onSubmit(responses);
    } catch {
      setSubmitError('Submission failed. Please retry.');
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-lg mx-auto px-4"
      noValidate
    >
      <div className="space-y-6">
        {questions.map((question) => {
          const response = responses.find((r) => r.questionId === question.id);
          const error = errors.find((e) => e.questionId === question.id);
          const errorId = `error-${question.id}`;

          return (
            <fieldset
              key={question.id}
              role="group"
              aria-label={question.title}
              aria-describedby={error ? errorId : undefined}
              className="border border-gray-200 rounded-lg p-4"
            >
              <legend className="text-base font-semibold text-gray-900 px-1">
                {question.title}
              </legend>
              <p className="text-sm text-gray-600 mt-1 mb-3">
                {question.description}
              </p>

              {/* Score selection (1-5) */}
              <div
                role="radiogroup"
                aria-label={`${question.title} score`}
                className="mb-3"
              >
                <span className="text-sm font-medium text-gray-700 block mb-2">
                  Score
                </span>
                <div className="flex flex-wrap gap-2">
                  {[1, 2, 3, 4, 5].map((score) => (
                    <label
                      key={score}
                      className={`
                        relative flex items-center justify-center w-10 h-10
                        rounded-full border-2 cursor-pointer text-sm font-medium
                        transition-colors
                        ${response?.score === score
                          ? 'border-blue-600 bg-blue-600 text-white'
                          : 'border-gray-300 bg-white text-gray-700 hover:border-blue-400'
                        }
                      `}
                    >
                      <input
                        type="radio"
                        name={`score-${question.id}`}
                        value={score}
                        checked={response?.score === score}
                        onChange={() => setScore(question.id, score)}
                        aria-label={String(score)}
                        className="sr-only"
                      />
                      {score}
                    </label>
                  ))}
                </div>
              </div>

              {/* Trend indicator (optional) */}
              <div
                role="radiogroup"
                aria-label={`${question.title} trend`}
                className="mb-2"
              >
                <span className="text-sm font-medium text-gray-700 block mb-2">
                  Trend <span className="text-gray-400 font-normal">(optional)</span>
                </span>
                <div className="flex flex-wrap gap-2">
                  {(['improving', 'stable', 'declining'] as const).map((trend) => (
                    <label
                      key={trend}
                      className={`
                        relative flex items-center px-3 py-1.5
                        rounded-full border cursor-pointer text-sm
                        transition-colors
                        ${response?.trendIndicator === trend
                          ? 'border-blue-600 bg-blue-50 text-blue-700'
                          : 'border-gray-300 bg-white text-gray-600 hover:border-blue-400'
                        }
                      `}
                    >
                      <input
                        type="radio"
                        name={`trend-${question.id}`}
                        value={trend}
                        checked={response?.trendIndicator === trend}
                        onChange={() => setTrend(question.id, trend)}
                        aria-label={trend.charAt(0).toUpperCase() + trend.slice(1)}
                        className="sr-only"
                      />
                      {trend.charAt(0).toUpperCase() + trend.slice(1)}
                    </label>
                  ))}
                </div>
              </div>

              {/* Validation error */}
              {error && (
                <p id={errorId} role="alert" className="text-sm text-red-600 mt-2">
                  {error.message}
                </p>
              )}
            </fieldset>
          );
        })}
      </div>

      {/* Network error message */}
      {submitError && (
        <p role="alert" className="text-sm text-red-600 mt-4 text-center">
          {submitError}
        </p>
      )}

      {/* Submit button */}
      <div className="mt-6">
        <button
          type="submit"
          disabled={isSubmitting}
          className={`
            w-full py-3 px-4 rounded-lg text-white font-medium text-base
            transition-colors
            ${isSubmitting
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800'
            }
          `}
        >
          {isSubmitting ? 'Submitting...' : 'Submit responses'}
        </button>
      </div>
    </form>
  );
}
