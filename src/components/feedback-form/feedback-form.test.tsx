import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';

import { FeedbackForm } from './feedback-form';
import type { Question, ResponseInput } from './types';

expect.extend(toHaveNoViolations);

const QUESTIONS: Question[] = [
  {
    id: 'q-delivering-value',
    title: 'Delivering Value',
    description: 'How well is the team delivering value to users and stakeholders?',
  },
  {
    id: 'q-team-collaboration',
    title: 'Team Collaboration',
    description: 'How effectively does the team work together and support each other?',
  },
  {
    id: 'q-ease-of-delivery',
    title: 'Ease of Delivery',
    description: 'How easy is it to get work done without unnecessary blockers or friction?',
  },
  {
    id: 'q-learning-improving',
    title: 'Learning and Improving',
    description: 'How well does the team learn from experience and continuously improve?',
  },
  {
    id: 'q-psychological-safety',
    title: 'Psychological Safety',
    description: 'How safe do team members feel to speak up, take risks, and be vulnerable?',
  },
];

describe('FeedbackForm', () => {
  const mockOnSubmit = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    mockOnSubmit.mockClear();
  });

  describe('rendering', () => {
    it('renders all questions with titles and descriptions', () => {
      render(<FeedbackForm questions={QUESTIONS} onSubmit={mockOnSubmit} />);

      for (const q of QUESTIONS) {
        expect(screen.getByText(q.title)).toBeInTheDocument();
        expect(screen.getByText(q.description)).toBeInTheDocument();
      }
    });

    it('renders score inputs (1-5) for each question', () => {
      render(<FeedbackForm questions={QUESTIONS} onSubmit={mockOnSubmit} />);

      for (const q of QUESTIONS) {
        const group = screen.getByRole('group', { name: new RegExp(q.title) });
        for (let score = 1; score <= 5; score++) {
          expect(within(group).getByRole('radio', { name: String(score) })).toBeInTheDocument();
        }
      }
    });

    it('renders optional trend indicator selector for each question', () => {
      render(<FeedbackForm questions={QUESTIONS} onSubmit={mockOnSubmit} />);

      for (const q of QUESTIONS) {
        const group = screen.getByRole('group', { name: new RegExp(q.title) });
        expect(within(group).getByRole('button', { name: /improving/i })).toBeInTheDocument();
        expect(within(group).getByRole('button', { name: /stable/i })).toBeInTheDocument();
        expect(within(group).getByRole('button', { name: /declining/i })).toBeInTheDocument();
      }
    });

    it('renders a submit button', () => {
      render(<FeedbackForm questions={QUESTIONS} onSubmit={mockOnSubmit} />);
      expect(screen.getByRole('button', { name: /submit/i })).toBeInTheDocument();
    });
  });

  describe('score selection', () => {
    it('allows selecting a score for a question', async () => {
      const user = userEvent.setup();
      render(<FeedbackForm questions={QUESTIONS} onSubmit={mockOnSubmit} />);

      const group = screen.getByRole('group', { name: /delivering value/i });
      const scoreBtn = within(group).getByRole('radio', { name: '4' });
      await user.click(scoreBtn);

      expect(scoreBtn).toBeChecked();
    });

    it('allows changing a score selection', async () => {
      const user = userEvent.setup();
      render(<FeedbackForm questions={QUESTIONS} onSubmit={mockOnSubmit} />);

      const group = screen.getByRole('group', { name: /delivering value/i });
      await user.click(within(group).getByRole('radio', { name: '3' }));
      await user.click(within(group).getByRole('radio', { name: '5' }));

      expect(within(group).getByRole('radio', { name: '5' })).toBeChecked();
      expect(within(group).getByRole('radio', { name: '3' })).not.toBeChecked();
    });
  });

  describe('trend indicator selection', () => {
    it('allows selecting a trend indicator', async () => {
      const user = userEvent.setup();
      render(<FeedbackForm questions={QUESTIONS} onSubmit={mockOnSubmit} />);

      const group = screen.getByRole('group', { name: /delivering value/i });
      const improving = within(group).getByRole('button', { name: /improving/i });
      await user.click(improving);

      expect(improving).toHaveAttribute('aria-pressed', 'true');
    });

    it('clears an optional trend when the selected option is clicked again', async () => {
      const user = userEvent.setup();
      render(<FeedbackForm questions={[QUESTIONS[0]]} onSubmit={mockOnSubmit} />);

      const group = screen.getByRole('group', { name: /delivering value/i });
      const score = within(group).getByRole('radio', { name: '4' });
      const improving = within(group).getByRole('button', { name: /improving/i });

      await user.click(score);
      await user.click(improving);
      expect(improving).toHaveAttribute('aria-pressed', 'true');

      await user.click(improving);
      expect(improving).toHaveAttribute('aria-pressed', 'false');
      expect(score).toBeChecked();

      await user.click(screen.getByRole('button', { name: /submit responses/i }));
      expect(mockOnSubmit).toHaveBeenCalledWith([
        { questionId: 'q-delivering-value', score: 4, trendIndicator: undefined },
      ]);
    });

    it('trend indicator defaults to no selection', () => {
      render(<FeedbackForm questions={QUESTIONS} onSubmit={mockOnSubmit} />);

      const group = screen.getByRole('group', { name: /delivering value/i });
      expect(within(group).getByRole('button', { name: /improving/i }))
        .toHaveAttribute('aria-pressed', 'false');
      expect(within(group).getByRole('button', { name: /stable/i }))
        .toHaveAttribute('aria-pressed', 'false');
      expect(within(group).getByRole('button', { name: /declining/i }))
        .toHaveAttribute('aria-pressed', 'false');
    });
  });

  describe('pre-populated responses', () => {
    it('pre-populates scores and trend indicators from initialResponses', () => {
      const initial: ResponseInput[] = [
        { questionId: 'q-delivering-value', score: 4, trendIndicator: 'improving' },
        { questionId: 'q-team-collaboration', score: 2, trendIndicator: 'declining' },
      ];

      render(
        <FeedbackForm questions={QUESTIONS} onSubmit={mockOnSubmit} initialResponses={initial} />
      );

      const dvGroup = screen.getByRole('group', { name: /delivering value/i });
      expect(within(dvGroup).getByRole('radio', { name: '4' })).toBeChecked();
      expect(within(dvGroup).getByRole('button', { name: /improving/i }))
        .toHaveAttribute('aria-pressed', 'true');

      const tcGroup = screen.getByRole('group', { name: /team collaboration/i });
      expect(within(tcGroup).getByRole('radio', { name: '2' })).toBeChecked();
      expect(within(tcGroup).getByRole('button', { name: /declining/i }))
        .toHaveAttribute('aria-pressed', 'true');
    });
  });

  describe('validation', () => {
    it('shows validation error when submitting without a score for any question', async () => {
      const user = userEvent.setup();
      render(<FeedbackForm questions={QUESTIONS} onSubmit={mockOnSubmit} />);

      await user.click(screen.getByRole('button', { name: /submit/i }));

      // Should show error for each question without a score
      for (const q of QUESTIONS) {
        expect(screen.getByText(new RegExp(`score.*${q.title}`, 'i'))).toBeInTheDocument();
      }
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it('shows validation error only for questions missing a score', async () => {
      const user = userEvent.setup();
      render(<FeedbackForm questions={QUESTIONS} onSubmit={mockOnSubmit} />);

      // Fill in first question only
      const dvGroup = screen.getByRole('group', { name: /delivering value/i });
      await user.click(within(dvGroup).getByRole('radio', { name: '3' }));

      await user.click(screen.getByRole('button', { name: /submit/i }));

      // First question should NOT have an error
      expect(screen.queryByText(/score.*delivering value/i)).not.toBeInTheDocument();
      // Other questions should have errors
      expect(screen.getByText(/score.*team collaboration/i)).toBeInTheDocument();

      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it('clears validation error for a question when score is selected', async () => {
      const user = userEvent.setup();
      render(<FeedbackForm questions={QUESTIONS} onSubmit={mockOnSubmit} />);

      // Trigger validation
      await user.click(screen.getByRole('button', { name: /submit/i }));
      expect(screen.getByText(/score.*delivering value/i)).toBeInTheDocument();

      // Select a score
      const dvGroup = screen.getByRole('group', { name: /delivering value/i });
      await user.click(within(dvGroup).getByRole('radio', { name: '4' }));

      // Error should be cleared
      expect(screen.queryByText(/score.*delivering value/i)).not.toBeInTheDocument();
    });
  });

  describe('submission', () => {
    it('calls onSubmit with all responses when form is valid', async () => {
      const user = userEvent.setup();
      render(<FeedbackForm questions={QUESTIONS} onSubmit={mockOnSubmit} />);

      // Fill all questions with scores
      for (const q of QUESTIONS) {
        const group = screen.getByRole('group', { name: new RegExp(q.title) });
        await user.click(within(group).getByRole('radio', { name: '4' }));
      }

      // Select trend for first question
      const dvGroup = screen.getByRole('group', { name: /delivering value/i });
      await user.click(within(dvGroup).getByRole('button', { name: /improving/i }));

      await user.click(screen.getByRole('button', { name: /submit/i }));

      expect(mockOnSubmit).toHaveBeenCalledTimes(1);
      const submitted = mockOnSubmit.mock.calls[0][0];
      expect(submitted).toHaveLength(5);
      expect(submitted[0]).toEqual({
        questionId: 'q-delivering-value',
        score: 4,
        trendIndicator: 'improving',
      });
      expect(submitted[1]).toEqual({
        questionId: 'q-team-collaboration',
        score: 4,
        trendIndicator: undefined,
      });
    });

    it('disables submit button while submitting', () => {
      render(
        <FeedbackForm questions={QUESTIONS} onSubmit={mockOnSubmit} isSubmitting={true} />
      );

      expect(screen.getByRole('button', { name: /submit/i })).toBeDisabled();
    });

    it('retains user input on network error for retry', async () => {
      const user = userEvent.setup();
      const failingSubmit = vi.fn().mockRejectedValue(new Error('Network error'));
      render(<FeedbackForm questions={QUESTIONS} onSubmit={failingSubmit} />);

      // Fill all questions
      for (const q of QUESTIONS) {
        const group = screen.getByRole('group', { name: new RegExp(q.title) });
        await user.click(within(group).getByRole('radio', { name: '3' }));
      }

      // Select trend
      const dvGroup = screen.getByRole('group', { name: /delivering value/i });
      await user.click(within(dvGroup).getByRole('button', { name: /stable/i }));

      // Submit - should fail
      await user.click(screen.getByRole('button', { name: /submit/i }));

      // Verify error is shown
      expect(await screen.findByText(/failed|error|retry/i)).toBeInTheDocument();

      // Verify input is retained
      for (const q of QUESTIONS) {
        const group = screen.getByRole('group', { name: new RegExp(q.title) });
        expect(within(group).getByRole('radio', { name: '3' })).toBeChecked();
      }
      expect(within(dvGroup).getByRole('button', { name: /stable/i }))
        .toHaveAttribute('aria-pressed', 'true');
    });
  });

  describe('mobile-friendly layout', () => {
    it('renders without horizontal overflow structure (no fixed-width elements)', () => {
      const { container } = render(
        <FeedbackForm questions={QUESTIONS} onSubmit={mockOnSubmit} />
      );

      // Verify no fixed-width styles that would cause horizontal scroll
      const allElements = container.querySelectorAll('*');
      for (const el of allElements) {
        const style = window.getComputedStyle(el);
        // No element should have a min-width greater than viewport
        expect(style.minWidth).not.toMatch(/^\d{4,}px/);
      }
    });
  });

  describe('accessibility', () => {
    it('has no axe-detectable accessibility violations', async () => {
      const { container } = render(
        <FeedbackForm questions={QUESTIONS} onSubmit={mockOnSubmit} />
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('associates validation errors with their questions using aria-describedby', async () => {
      const user = userEvent.setup();
      render(<FeedbackForm questions={QUESTIONS} onSubmit={mockOnSubmit} />);

      await user.click(screen.getByRole('button', { name: /submit/i }));

      // Each question group should have an error linked via aria
      const firstGroup = screen.getByRole('group', { name: /delivering value/i });
      const errorId = firstGroup.getAttribute('aria-describedby');
      expect(errorId).toBeTruthy();
      const errorEl = document.getElementById(errorId!);
      expect(errorEl).toBeInTheDocument();
      expect(errorEl!.textContent).toMatch(/score/i);
    });
  });
});
