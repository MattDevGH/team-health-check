/**
 * Tests for the Session Link landing page.
 * Requirements: 4.1, 4.2, 4.8
 *
 * TDD: Red phase — these tests define the expected behaviour
 * before the component is implemented.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import SessionLinkPage from '@/app/session/[token]/page';

const QUESTIONS = [
  { id: 'q-delivering-value', title: 'Delivering Value', description: 'How well is the team delivering value?', displayOrder: 1 },
  { id: 'q-team-collaboration', title: 'Team Collaboration', description: 'How effectively does the team work together?', displayOrder: 2 },
  { id: 'q-ease-of-delivery', title: 'Ease of Delivery', description: 'How easy is it to get work done?', displayOrder: 3 },
  { id: 'q-learning-improving', title: 'Learning and Improving', description: 'How well does the team learn and improve?', displayOrder: 4 },
  { id: 'q-psychological-safety', title: 'Psychological Safety', description: 'How safe do team members feel to speak up?', displayOrder: 5 },
];

function mockValidToken(options: {
  cadencePreference?: string;
  responses?: Array<{ questionId: string; score: number; trendIndicator?: string | null }>;
} = {}) {
  const { cadencePreference = 'weekly', responses = [] } = options;

  server.use(
    http.get('/api/auth/session-link/:token', () => {
      return HttpResponse.json({
        memberId: 'member-1',
        sessionId: 'session-1',
        memberName: 'Alice',
        cadencePreference,
        questions: QUESTIONS,
        responses,
      });
    }),
  );
}

function mockInvalidToken() {
  server.use(
    http.get('/api/auth/session-link/:token', () => {
      return HttpResponse.json(
        { error: 'Invalid or expired session link' },
        { status: 404 },
      );
    }),
  );
}

describe('Session Link Landing Page', () => {
  beforeEach(() => {
    mockValidToken();
  });

  describe('Token validation', () => {
    it('displays an error message for invalid tokens', async () => {
      mockInvalidToken();
      render(<SessionLinkPage params={Promise.resolve({ token: 'invalid-token' })} />);

      await waitFor(() => {
        expect(screen.getByText(/invalid or expired/i)).toBeInTheDocument();
      });
    });

    it('displays loading state while validating token', () => {
      render(<SessionLinkPage params={Promise.resolve({ token: 'valid-token' })} />);
      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });
  });

  describe('Weekly mode (Requirement 4.1)', () => {
    beforeEach(() => {
      mockValidToken({ cadencePreference: 'weekly' });
    });

    it('renders all 5 questions in a scrollable view', async () => {
      render(<SessionLinkPage params={Promise.resolve({ token: 'valid-token' })} />);

      await waitFor(() => {
        expect(screen.getByText('Delivering Value')).toBeInTheDocument();
      });

      expect(screen.getByText('Team Collaboration')).toBeInTheDocument();
      expect(screen.getByText('Ease of Delivery')).toBeInTheDocument();
      expect(screen.getByText('Learning and Improving')).toBeInTheDocument();
      expect(screen.getByText('Psychological Safety')).toBeInTheDocument();
    });

    it('renders score inputs (1-5) for each question', async () => {
      render(<SessionLinkPage params={Promise.resolve({ token: 'valid-token' })} />);

      await waitFor(() => {
        expect(screen.getByText('Delivering Value')).toBeInTheDocument();
      });

      // Each question should have a score radiogroup with 5 radio options
      const scoreGroups = screen.getAllByRole('radiogroup', { name: /score/i });
      expect(scoreGroups.length).toBe(5);

      // Each score group has 5 radio inputs
      const firstGroupRadios = scoreGroups[0].querySelectorAll('input[type="radio"]');
      expect(firstGroupRadios.length).toBe(5);
    });

    it('renders optional trend indicator for each question', async () => {
      render(<SessionLinkPage params={Promise.resolve({ token: 'valid-token' })} />);

      await waitFor(() => {
        expect(screen.getByText('Delivering Value')).toBeInTheDocument();
      });

      // Each question should have a trend group with 3 options
      const trendGroups = screen.getAllByRole('radiogroup', { name: /trend/i });
      expect(trendGroups.length).toBe(5);

      const firstGroupRadios = trendGroups[0].querySelectorAll('input[type="radio"]');
      expect(firstGroupRadios.length).toBe(3);
    });
  });

  describe('Micro-pulse mode (Requirement 4.1)', () => {
    beforeEach(() => {
      mockValidToken({ cadencePreference: 'micro_pulse' });
    });

    it('renders only a single question initially', async () => {
      render(<SessionLinkPage params={Promise.resolve({ token: 'valid-token' })} />);

      await waitFor(() => {
        // Should show the first unanswered question
        expect(screen.getByText('Delivering Value')).toBeInTheDocument();
      });

      // Other questions should not be visible initially
      expect(screen.queryByText('Team Collaboration')).not.toBeInTheDocument();
    });

    it('shows an expand option to view all questions', async () => {
      render(<SessionLinkPage params={Promise.resolve({ token: 'valid-token' })} />);

      await waitFor(() => {
        expect(screen.getByText('Delivering Value')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /view all questions/i })).toBeInTheDocument();
    });
  });

  describe('Pre-populate responses (Requirement 4.8)', () => {
    it('pre-populates previously submitted scores', async () => {
      mockValidToken({
        cadencePreference: 'weekly',
        responses: [
          { questionId: 'q-delivering-value', score: 4, trendIndicator: 'improving' },
          { questionId: 'q-team-collaboration', score: 3, trendIndicator: null },
        ],
      });

      render(<SessionLinkPage params={Promise.resolve({ token: 'valid-token' })} />);

      await waitFor(() => {
        expect(screen.getByText('Delivering Value')).toBeInTheDocument();
      });

      // The score of 4 for Delivering Value should be pre-selected
      const dvScoreGroup = screen.getByRole('radiogroup', { name: 'Delivering Value score' });
      const selectedRadio = dvScoreGroup.querySelector('input[value="4"]') as HTMLInputElement | null;
      expect(selectedRadio).not.toBeNull();
      expect(selectedRadio!.checked).toBe(true);
    });

    it('pre-populates previously submitted trend indicators', async () => {
      mockValidToken({
        cadencePreference: 'weekly',
        responses: [
          { questionId: 'q-delivering-value', score: 4, trendIndicator: 'improving' },
        ],
      });

      render(<SessionLinkPage params={Promise.resolve({ token: 'valid-token' })} />);

      await waitFor(() => {
        expect(screen.getByText('Delivering Value')).toBeInTheDocument();
      });

      // The trend indicator for Delivering Value should show 'improving' as selected
      const dvTrendGroup = screen.getByRole('radiogroup', { name: 'Delivering Value trend' });
      const selectedTrend = dvTrendGroup.querySelector('input[value="improving"]') as HTMLInputElement | null;
      expect(selectedTrend).not.toBeNull();
      expect(selectedTrend!.checked).toBe(true);
    });
  });
});
