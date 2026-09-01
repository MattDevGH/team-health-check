/**
 * Tests for the QuestionDetailView component.
 * Requirements: 8.5, 8.7
 *
 * TDD: Red phase — tests define expected behaviour for
 * question detail drill-down on the trend dashboard.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { QuestionDetailView } from './question-detail-view';

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

const SESSIONS: SessionData[] = [
  {
    sessionId: 's1',
    closedAt: '2025-01-08T17:00:00Z',
    averages: [
      { questionId: 'q-delivering-value', averageScore: 3.5, responseCount: 5 },
      { questionId: 'q-team-collaboration', averageScore: 4.0, responseCount: 4 },
    ],
  },
  {
    sessionId: 's2',
    closedAt: '2025-01-15T17:00:00Z',
    averages: [
      { questionId: 'q-delivering-value', averageScore: 4.2, responseCount: 6 },
      { questionId: 'q-team-collaboration', averageScore: 3.8, responseCount: 2 },
    ],
  },
  {
    sessionId: 's3',
    closedAt: '2025-01-22T17:00:00Z',
    averages: [
      { questionId: 'q-delivering-value', averageScore: 4.0, responseCount: 7 },
      { questionId: 'q-team-collaboration', averageScore: 4.5, responseCount: 5 },
    ],
  },
];

/**
 * Manager Experience 3.8, 3.9.
 *
 * The rows expand, but nothing said so: a screen reader announced a button with
 * a question's name and no indication that activating it revealed anything, or
 * whether it was already open.
 */
/**
 * Dashboard Refinement 4.3, 4.4.
 *
 * A session where nobody answered this theme was skipped entirely, so the
 * history omitted it and a reader could not tell a gap from a check that never
 * ran.
 */
describe('QuestionDetailView sessions with no responses', () => {
  const MIXED: SessionData[] = [
    {
      sessionId: 's1',
      closedAt: '2025-01-08T17:00:00Z',
      averages: [{ questionId: 'q-delivering-value', averageScore: 3.5, responseCount: 5 }],
    },
    {
      // This session recorded nothing for Delivering Value
      sessionId: 's2',
      closedAt: '2025-01-15T17:00:00Z',
      averages: [{ questionId: 'q-team-collaboration', averageScore: 4.0, responseCount: 3 }],
    },
  ];

  it('keeps a session in the history even when the theme went unanswered', async () => {
    const user = userEvent.setup();
    render(<QuestionDetailView sessions={MIXED} anonymousMode={false} />);

    await user.click(screen.getByRole('button', { name: /delivering value/i }));

    const detail = screen.getByRole('region', { name: /delivering value/i });
    expect(detail).toHaveTextContent('Jan 15');
    expect(detail).toHaveTextContent(/no responses/i);
  });

  it('does not describe an unanswered session as insufficient data', async () => {
    // "Insufficient data" means people answered and there were too few to show
    const user = userEvent.setup();
    render(<QuestionDetailView sessions={MIXED} anonymousMode={true} />);

    await user.click(screen.getByRole('button', { name: /delivering value/i }));

    const detail = screen.getByRole('region', { name: /delivering value/i });
    expect(detail).toHaveTextContent(/no responses/i);
    expect(detail).not.toHaveTextContent(/insufficient data/i);
  });
});

describe('QuestionDetailView disclosure semantics', () => {
  it('announces that a question expands, and that it starts collapsed', () => {
    render(<QuestionDetailView sessions={SESSIONS} anonymousMode={false} />);

    expect(screen.getByRole('button', { name: /delivering value/i })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('reports itself as expanded once opened', async () => {
    const user = userEvent.setup();
    render(<QuestionDetailView sessions={SESSIONS} anonymousMode={false} />);

    const trigger = screen.getByRole('button', { name: /delivering value/i });
    await user.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('points at the panel it controls, and that panel exists', () => {
    // An aria-controls naming an element that is not in the document is worse
    // than none: it promises a relationship the page does not have
    render(<QuestionDetailView sessions={SESSIONS} anonymousMode={false} />);

    const trigger = screen.getByRole('button', { name: /delivering value/i });
    const controlledId = trigger.getAttribute('aria-controls');
    expect(controlledId).toBeTruthy();

    expect(document.getElementById(controlledId!)).toBeInTheDocument();
  });

  it('gives the revealed detail a name of its own', async () => {
    const user = userEvent.setup();
    render(<QuestionDetailView sessions={SESSIONS} anonymousMode={false} />);

    await user.click(screen.getByRole('button', { name: /delivering value/i }));

    // A named region is what lets the E2E suite stop locating this by a
    // Tailwind class that any restyle would break
    expect(
      screen.getByRole('region', { name: /delivering value/i }),
    ).toBeInTheDocument();
  });

  it('collapses again, and says so', async () => {
    const user = userEvent.setup();
    render(<QuestionDetailView sessions={SESSIONS} anonymousMode={false} />);

    const trigger = screen.getByRole('button', { name: /delivering value/i });
    await user.click(trigger);
    await user.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('region', { name: /delivering value/i })).not.toBeInTheDocument();
  });

  it('is operable by keyboard', async () => {
    const user = userEvent.setup();
    render(<QuestionDetailView sessions={SESSIONS} anonymousMode={false} />);

    const trigger = screen.getByRole('button', { name: /delivering value/i });
    trigger.focus();
    await user.keyboard('{Enter}');

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('QuestionDetailView', () => {
  describe('Requirement 8.5: Clickable question list with detail', () => {
    it('renders a list of question names that are clickable', () => {
      render(<QuestionDetailView sessions={SESSIONS} anonymousMode={false} />);

      expect(screen.getByRole('button', { name: /delivering value/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /team collaboration/i })).toBeInTheDocument();
    });

    it('shows detail panel with per-session averages when a question is clicked', async () => {
      const user = userEvent.setup();
      render(<QuestionDetailView sessions={SESSIONS} anonymousMode={false} />);

      await user.click(screen.getByRole('button', { name: /delivering value/i }));

      // Should show average score per session
      expect(screen.getByText('3.5')).toBeInTheDocument();
      expect(screen.getByText('4.2')).toBeInTheDocument();
      expect(screen.getByText('4.0')).toBeInTheDocument();
    });

    it('shows response count per session when a question is clicked', async () => {
      const user = userEvent.setup();
      render(<QuestionDetailView sessions={SESSIONS} anonymousMode={false} />);

      await user.click(screen.getByRole('button', { name: /delivering value/i }));

      // Should show response counts
      expect(screen.getByText('5 responses')).toBeInTheDocument();
      expect(screen.getByText('6 responses')).toBeInTheDocument();
      expect(screen.getByText('7 responses')).toBeInTheDocument();
    });

    it('shows session dates in the detail panel', async () => {
      const user = userEvent.setup();
      render(<QuestionDetailView sessions={SESSIONS} anonymousMode={false} />);

      await user.click(screen.getByRole('button', { name: /delivering value/i }));

      expect(screen.getByText('Jan 8')).toBeInTheDocument();
      expect(screen.getByText('Jan 15')).toBeInTheDocument();
      expect(screen.getByText('Jan 22')).toBeInTheDocument();
    });

    it('hides detail when clicking the same question again', async () => {
      const user = userEvent.setup();
      render(<QuestionDetailView sessions={SESSIONS} anonymousMode={false} />);

      await user.click(screen.getByRole('button', { name: /delivering value/i }));
      expect(screen.getByText('3.5')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /delivering value/i }));
      expect(screen.queryByText('5 responses')).not.toBeInTheDocument();
    });

    it('switches detail panel when clicking a different question', async () => {
      const user = userEvent.setup();
      render(<QuestionDetailView sessions={SESSIONS} anonymousMode={false} />);

      await user.click(screen.getByRole('button', { name: /delivering value/i }));
      expect(screen.getByText('3.5')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /team collaboration/i }));
      // Now should show team collaboration data
      expect(screen.getByText('4.5')).toBeInTheDocument();
      // delivering value data should be gone
      expect(screen.queryByText('3.5')).not.toBeInTheDocument();
    });
  });

  describe('Requirement 8.7: Anonymity threshold suppression', () => {
    it('shows "Insufficient data" for sessions below threshold in anonymous mode', async () => {
      const user = userEvent.setup();
      render(<QuestionDetailView sessions={SESSIONS} anonymousMode={true} />);

      // team-collaboration in s2 has only 2 responses (below threshold of 3)
      await user.click(screen.getByRole('button', { name: /team collaboration/i }));

      expect(screen.getByText('Insufficient data')).toBeInTheDocument();
    });

    it('does not suppress data for sessions at or above threshold in anonymous mode', async () => {
      const user = userEvent.setup();
      render(<QuestionDetailView sessions={SESSIONS} anonymousMode={true} />);

      await user.click(screen.getByRole('button', { name: /team collaboration/i }));

      // s1 has 4 responses (above threshold) - should show normally
      expect(screen.getByText('4.0')).toBeInTheDocument();
      // s3 has 5 responses (above threshold) - should show normally
      expect(screen.getByText('4.5')).toBeInTheDocument();
    });

    it('does not suppress data below threshold when not in anonymous mode', async () => {
      const user = userEvent.setup();
      render(<QuestionDetailView sessions={SESSIONS} anonymousMode={false} />);

      // team-collaboration in s2 has only 2 responses but NOT anonymous mode
      await user.click(screen.getByRole('button', { name: /team collaboration/i }));

      // Should show the average even with 2 responses
      expect(screen.getByText('3.8')).toBeInTheDocument();
      expect(screen.queryByText('Insufficient data')).not.toBeInTheDocument();
    });

    it('shows "Insufficient data" instead of both average and response count', async () => {
      const user = userEvent.setup();
      render(<QuestionDetailView sessions={SESSIONS} anonymousMode={true} />);

      await user.click(screen.getByRole('button', { name: /team collaboration/i }));

      // s2 has 2 responses in anonymous mode - suppressed
      // Should NOT show the average of 3.8 or "2 responses"
      expect(screen.queryByText('3.8')).not.toBeInTheDocument();
      expect(screen.queryByText('2 responses')).not.toBeInTheDocument();
    });
  });
});
