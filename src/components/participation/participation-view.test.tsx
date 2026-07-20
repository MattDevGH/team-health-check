/**
 * Tests for ParticipationView component.
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.6
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

import { ParticipationView } from './participation-view';
import type { ParticipationData } from './types';

expect.extend(toHaveNoViolations);

const BASE_DATA: ParticipationData = {
  totalCount: 6,
  respondedCount: 4,
  nonResponders: [
    { id: 'member-5', name: 'Alice' },
    { id: 'member-6', name: 'Bob' },
  ],
};

describe('ParticipationView', () => {
  describe('participation count display (Req 11.1)', () => {
    it('displays responded count out of total members', () => {
      render(
        <ParticipationView
          data={BASE_DATA}
          privacyMode="attributed"
          userRole="delivery_manager"
        />
      );

      expect(screen.getByText(/4/)).toBeInTheDocument();
      expect(screen.getByText(/6/)).toBeInTheDocument();
      expect(screen.getByText(/4\s*\/\s*6/)).toBeInTheDocument();
    });

    it('displays "responded" label', () => {
      render(
        <ParticipationView
          data={BASE_DATA}
          privacyMode="attributed"
          userRole="team_member"
        />
      );

      expect(screen.getByText('responded')).toBeInTheDocument();
    });

    it('handles zero responses', () => {
      const data: ParticipationData = {
        totalCount: 5,
        respondedCount: 0,
        nonResponders: [
          { id: 'm1', name: 'A' },
          { id: 'm2', name: 'B' },
          { id: 'm3', name: 'C' },
          { id: 'm4', name: 'D' },
          { id: 'm5', name: 'E' },
        ],
      };

      render(
        <ParticipationView
          data={data}
          privacyMode="attributed"
          userRole="delivery_manager"
        />
      );

      expect(screen.getByText(/0\s*\/\s*5/)).toBeInTheDocument();
    });

    it('handles full participation (all responded)', () => {
      const data: ParticipationData = {
        totalCount: 4,
        respondedCount: 4,
        nonResponders: [],
      };

      render(
        <ParticipationView
          data={data}
          privacyMode="attributed"
          userRole="delivery_manager"
        />
      );

      expect(screen.getByText(/4\s*\/\s*4/)).toBeInTheDocument();
    });
  });

  describe('non-responder names in anonymous mode (Req 11.2)', () => {
    it('shows non-responder names to delivery_manager in anonymous mode', () => {
      render(
        <ParticipationView
          data={BASE_DATA}
          privacyMode="anonymous"
          userRole="delivery_manager"
        />
      );

      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('Bob')).toBeInTheDocument();
    });

    it('hides non-responder names from team_member in anonymous mode', () => {
      render(
        <ParticipationView
          data={BASE_DATA}
          privacyMode="anonymous"
          userRole="team_member"
        />
      );

      expect(screen.queryByText('Alice')).not.toBeInTheDocument();
      expect(screen.queryByText('Bob')).not.toBeInTheDocument();
    });

    it('shows non-responder count (not names) to team_member in anonymous mode', () => {
      render(
        <ParticipationView
          data={BASE_DATA}
          privacyMode="anonymous"
          userRole="team_member"
        />
      );

      // Should still show the count info (4/6 responded) but not individual names
      expect(screen.getByText(/4\s*\/\s*6/)).toBeInTheDocument();
    });
  });

  describe('non-responder names in attributed mode (Req 11.3)', () => {
    it('shows non-responder names to all team members in attributed mode', () => {
      render(
        <ParticipationView
          data={BASE_DATA}
          privacyMode="attributed"
          userRole="team_member"
        />
      );

      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('Bob')).toBeInTheDocument();
    });

    it('shows non-responder names to delivery_manager in attributed mode', () => {
      render(
        <ParticipationView
          data={BASE_DATA}
          privacyMode="attributed"
          userRole="delivery_manager"
        />
      );

      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('Bob')).toBeInTheDocument();
    });
  });

  describe('no individual scores exposed (Req 11.4)', () => {
    it('does not render any score or trend indicator data', () => {
      const { container } = render(
        <ParticipationView
          data={BASE_DATA}
          privacyMode="attributed"
          userRole="delivery_manager"
        />
      );

      const html = container.innerHTML;
      expect(html).not.toContain('score');
      expect(html).not.toContain('trendIndicator');
      expect(html).not.toContain('improving');
      expect(html).not.toContain('declining');
    });
  });

  describe('loading state', () => {
    it('shows loading indicator when isLoading is true', () => {
      render(
        <ParticipationView
          data={{ totalCount: 0, respondedCount: 0, nonResponders: [] }}
          privacyMode="attributed"
          userRole="team_member"
          isLoading={true}
        />
      );

      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });
  });

  describe('error state', () => {
    it('shows error message when error is provided', () => {
      render(
        <ParticipationView
          data={{ totalCount: 0, respondedCount: 0, nonResponders: [] }}
          privacyMode="attributed"
          userRole="team_member"
          error="Failed to load participation data"
        />
      );

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
    });
  });

  describe('full participation message', () => {
    it('shows a positive message when everyone has responded', () => {
      const data: ParticipationData = {
        totalCount: 6,
        respondedCount: 6,
        nonResponders: [],
      };

      render(
        <ParticipationView
          data={data}
          privacyMode="attributed"
          userRole="delivery_manager"
        />
      );

      expect(screen.getByText(/everyone.*responded|all.*responded/i)).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('has no axe-detectable accessibility violations', async () => {
      const { container } = render(
        <ParticipationView
          data={BASE_DATA}
          privacyMode="attributed"
          userRole="delivery_manager"
        />
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('uses appropriate ARIA landmark/labelling', () => {
      render(
        <ParticipationView
          data={BASE_DATA}
          privacyMode="attributed"
          userRole="delivery_manager"
        />
      );

      expect(screen.getByRole('region', { name: /participation/i })).toBeInTheDocument();
    });
  });
});
