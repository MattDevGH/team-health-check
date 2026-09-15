/**
 * Types for the FeedbackForm component.
 * Validates: Requirements 4.3, 4.5, 4.7, 4.10
 */

export type TrendIndicator = 'improving' | 'stable' | 'declining';

export interface Question {
  id: string;
  title: string;
  description: string;
}

export interface ResponseInput {
  questionId: string;
  score: number | null;
  trendIndicator?: TrendIndicator;
}

export interface FeedbackFormProps {
  /** The list of questions to display */
  questions: Question[];
  /** Optional complete question set used to preserve state across partial views */
  responseQuestions?: Question[];
  /** Optional pre-populated responses (for editing existing submissions) */
  initialResponses?: ResponseInput[];
  /** Called when user submits the form with valid responses */
  onSubmit: (responses: ResponseInput[]) => Promise<void>;
  /** Whether the form is currently submitting */
  isSubmitting?: boolean;
  /**
   * Whether this member already has answers saved for this check.
   *
   * Changes the control from *submit* to *update*. It is a prop rather than
   * something derived from `initialResponses` because it has to change the
   * moment a submission succeeds, without the form being remounted — which
   * is exactly the moment a member looked at an unchanged button and asked
   * whether they had just answered twice.
   */
  hasSavedAnswers?: boolean;
}

export interface ValidationError {
  questionId: string;
  message: string;
}
