'use client';

/**
 * Session Link Landing Page
 * Requirements: 4.1, 4.2, 4.6, 4.8, 4.9, 4.10, 16.1, 16.5
 *
 * Validates the session token, fetches member context (cadence, questions, responses),
 * and renders the FeedbackForm for submission. Displays rolling averages on success,
 * or a "session ended" message if the session is already closed.
 */

import { useEffect, useState, useCallback } from 'react';

import { FeedbackForm } from '@/components/feedback-form/feedback-form';
import type { FeedbackFormProps, Question, ResponseInput } from '@/components/feedback-form/types';

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

interface SessionContext {
  memberId: string;
  sessionId: string;
  memberName: string;
  cadencePreference: string;
  sessionStatus: 'open' | 'closed';
  questions: QuestionData[];
  allQuestions: QuestionData[];
  expandable: boolean;
  responses: ResponseData[];
}

interface RollingAverageResult {
  questionId: string;
  score: number;
  rollingAverage: number | null;
}

interface PageProps {
  params: Promise<{ token: string }>;
}

export default function SessionLinkPage({ params }: PageProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [context, setContext] = useState<SessionContext | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [results, setResults] = useState<RollingAverageResult[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function validate() {
      const { token } = await params;

      try {
        const res = await fetch(`/api/auth/session-link/${token}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          if (!cancelled) {
            setError(body.error ?? 'Invalid or expired session link');
            setLoading(false);
          }
          return;
        }

        const data: SessionContext = await res.json();
        if (!cancelled) {
          setContext(data);
          setSessionEnded(data.sessionStatus === 'closed');
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError('Failed to load session. Please try again.');
          setLoading(false);
        }
      }
    }

    validate();
    return () => { cancelled = true; };
  }, [params]);

  const handleSubmit = useCallback(async (responses: ResponseInput[]) => {
    if (!context) return;

    setIsSubmitting(true);

    // Build the POST body
    const body = {
      memberId: context.memberId,
      sessionId: context.sessionId,
      responses: responses
        .filter((r) => r.score !== null)
        .map((r) => ({
          questionId: r.questionId,
          score: r.score,
          ...(r.trendIndicator ? { trendIndicator: r.trendIndicator } : {}),
        })),
    };

    try {
      const res = await fetch('/api/responses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.status === 409) {
        setSessionEnded(true);
        setIsSubmitting(false);
        return;
      }

      if (!res.ok) {
        setIsSubmitting(false);
        throw new Error('Submission failed');
      }

      const data = await res.json();
      setResults(data.responses ?? []);
      setSubmitted(true);
      setIsSubmitting(false);
    } catch {
      setIsSubmitting(false);
      throw new Error('Submission failed. Please retry.');
    }
  }, [context]);

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <p className="text-gray-600">Loading...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-red-600 font-medium">{error}</p>
        </div>
      </main>
    );
  }

  if (!context) return null;

  // Session ended state
  if (sessionEnded) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <h1 className="text-xl font-bold text-gray-800 mb-2">Session Ended</h1>
          <p className="text-gray-600">
            This session has ended and is no longer accepting responses.
          </p>
        </div>
      </main>
    );
  }

  // Submission confirmation state with rolling averages
  if (submitted) {
    return (
      <main className="min-h-screen bg-gray-50 py-6 px-4">
        <div className="max-w-lg mx-auto">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-gray-800 mb-2">
              Thank you!
            </h1>
            <p className="text-gray-600">
              Your responses have been submitted successfully.
            </p>
          </div>

          <div className="space-y-3">
            {results.map((result) => {
              const question = context.allQuestions.find(
                (q) => q.id === result.questionId
              );
              return (
                <div
                  key={result.questionId}
                  className="bg-white rounded-lg border border-gray-200 p-4"
                >
                  <p className="font-medium text-gray-800">
                    {question?.title ?? result.questionId}
                  </p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-sm text-gray-600">
                      Your score: {result.score}
                    </span>
                    <span className="text-sm text-gray-500">·</span>
                    {result.rollingAverage !== null ? (
                      <span className="text-sm text-blue-600 font-medium">
                        Recent team average: {result.rollingAverage}
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400 italic">
                        More responses needed
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    );
  }

  // Active form state
  const sortedQuestions = [...context.questions].sort(
    (a, b) => a.displayOrder - b.displayOrder
  );

  // Map to FeedbackForm Question shape
  const selectedFormQuestions: Question[] = sortedQuestions.map((q) => ({
    id: q.id,
    title: q.title,
    description: q.description,
  }));
  const allFormQuestions: Question[] = [...context.allQuestions]
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((q) => ({ id: q.id, title: q.title, description: q.description }));

  // Map existing responses to FeedbackForm initialResponses
  const initialResponses: ResponseInput[] = context.responses.map((r) => ({
    questionId: r.questionId,
    score: r.score,
    trendIndicator: r.trendIndicator as ResponseInput['trendIndicator'],
  }));

  const isMicroPulse = context.cadencePreference === 'micro_pulse';

  return (
    <main className="min-h-screen bg-gray-50 py-6 px-4">
      <div className="max-w-lg mx-auto">
        <h1 className="text-2xl font-bold text-gray-800 mb-1">
          Health Check
        </h1>
        <p className="text-gray-500 text-sm mb-6">
          Hi {context.memberName}, rate each area from 1 (needs work) to 5 (great).
        </p>

        {isMicroPulse ? (
          <MicroPulseView
            questions={selectedFormQuestions}
            allQuestions={allFormQuestions}
            expandable={context.expandable}
            initialResponses={initialResponses}
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
          />
        ) : (
          <FeedbackForm
            questions={selectedFormQuestions}
            initialResponses={initialResponses}
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
          />
        )}
      </div>
    </main>
  );
}

interface MicroPulseViewProps extends FeedbackFormProps {
  allQuestions: Question[];
  expandable: boolean;
}

function MicroPulseView({
  questions,
  allQuestions,
  expandable,
  initialResponses,
  onSubmit,
  isSubmitting,
}: MicroPulseViewProps) {
  const [showAll, setShowAll] = useState(false);
  const visibleQuestions = showAll ? allQuestions : questions;

  return (
    <div>
      {visibleQuestions.length > 0 ? (
        <FeedbackForm
          questions={visibleQuestions}
          responseQuestions={allQuestions}
          initialResponses={initialResponses}
          onSubmit={onSubmit}
          isSubmitting={isSubmitting}
        />
      ) : (
        <p className="text-center text-gray-600">
          You have answered all micro-pulse questions for this session.
        </p>
      )}
      {!showAll && expandable ? (
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="text-blue-600 text-sm hover:underline"
          >
            View all questions
          </button>
        </div>
      ) : null}
    </div>
  );
}
