/**
 * Tests for Audit Log Page
 *
 * Requirements: 18.4, 18.5
 * - 18.4: Display audit log entries most recent first, delivery_manager only
 * - 18.5: Cursor-based pagination via read-only API endpoint
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, it, expect, beforeEach } from 'vitest';

import { server } from '@/tests/mocks/server';

import AuditLogPage from './page';

const TEAM_ID = 'team-audit-1';

const mockEntries = [
  {
    id: 'entry-2',
    changeType: 'privacy_mode_changed',
    previousValue: 'anonymous',
    newValue: 'attributed',
    userId: 'member-1',
    timestamp: '2025-01-16T14:00:00Z',
  },
  {
    id: 'entry-1',
    changeType: 'schedule_changed',
    previousValue: 'weekly',
    newValue: 'fortnightly',
    userId: 'member-1',
    timestamp: '2025-01-15T10:30:00Z',
  },
];

function setupHandlers(options?: {
  entries?: typeof mockEntries;
  nextCursor?: string | null;
  forbidden?: boolean;
}) {
  const {
    entries = mockEntries,
    nextCursor = null,
    forbidden = false,
  } = options ?? {};

  server.use(
    http.get(`/api/teams/${TEAM_ID}/audit-log`, ({ request }) => {
      if (forbidden) {
        return HttpResponse.json(
          { errors: [{ code: 'FORBIDDEN', message: 'Access denied' }] },
          { status: 403 }
        );
      }

      const url = new URL(request.url);
      const cursor = url.searchParams.get('cursor');

      // If cursor provided, return second page (empty)
      if (cursor) {
        return HttpResponse.json({
          entries: [],
          nextCursor: null,
        });
      }

      return HttpResponse.json({
        entries,
        nextCursor,
      });
    })
  );
}

function renderPage() {
  const params = Promise.resolve({ teamId: TEAM_ID });
  return render(<AuditLogPage params={params} />);
}

describe('Audit Log Page', () => {
  describe('Access control (Requirement 18.4)', () => {
    it('shows access denied when user lacks delivery_manager role', async () => {
      setupHandlers({ forbidden: true });
      renderPage();

      await waitFor(() => {
        expect(screen.getByText(/access denied/i)).toBeInTheDocument();
      });
    });
  });

  describe('Loading state', () => {
    it('renders loading state initially', () => {
      setupHandlers();
      renderPage();
      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });
  });

  describe('Displaying entries (Requirement 18.4)', () => {
    beforeEach(() => {
      setupHandlers();
    });

    it('renders page heading', async () => {
      renderPage();
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /audit log/i })).toBeInTheDocument();
      });
    });

    it('displays entries in reverse chronological order (most recent first)', async () => {
      renderPage();
      await waitFor(() => {
        expect(screen.getByText(/privacy_mode_changed/i)).toBeInTheDocument();
      });

      const entries = screen.getAllByRole('article');
      expect(entries).toHaveLength(2);

      // First entry should be the most recent one
      expect(entries[0]).toHaveTextContent(/privacy_mode_changed/i);
      expect(entries[1]).toHaveTextContent(/schedule_changed/i);
    });

    it('displays change type for each entry', async () => {
      renderPage();
      await waitFor(() => {
        expect(screen.getByText(/privacy_mode_changed/i)).toBeInTheDocument();
        expect(screen.getByText(/schedule_changed/i)).toBeInTheDocument();
      });
    });

    it('displays previous and new values with arrow', async () => {
      renderPage();
      await waitFor(() => {
        expect(screen.getByText(/anonymous/)).toBeInTheDocument();
        expect(screen.getByText(/attributed/)).toBeInTheDocument();
      });
    });

    it('displays timestamp for each entry', async () => {
      renderPage();
      await waitFor(() => {
        // Timestamps should be rendered in a human-readable format
        expect(screen.getByText(/16 Jan 2025/i)).toBeInTheDocument();
        expect(screen.getByText(/15 Jan 2025/i)).toBeInTheDocument();
      });
    });

    it('displays who made the change', async () => {
      renderPage();
      await waitFor(() => {
        // userId should appear somewhere
        const entries = screen.getAllByRole('article');
        expect(entries[0]).toHaveTextContent('member-1');
      });
    });

    it('shows empty state when no entries exist', async () => {
      setupHandlers({ entries: [] });
      renderPage();

      await waitFor(() => {
        expect(screen.getByText(/no audit log entries/i)).toBeInTheDocument();
      });
    });
  });

  describe('Pagination (Requirement 18.5)', () => {
    it('shows "Load more" button when nextCursor is present', async () => {
      setupHandlers({ nextCursor: 'cursor-abc' });
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /load more/i })).toBeInTheDocument();
      });
    });

    it('hides "Load more" button when nextCursor is null', async () => {
      setupHandlers({ nextCursor: null });
      renderPage();

      await waitFor(() => {
        expect(screen.getByText(/privacy_mode_changed/i)).toBeInTheDocument();
      });

      expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument();
    });

    it('loads more entries when "Load more" button is clicked', async () => {
      const user = userEvent.setup();

      // First page returns entries with cursor, second page returns empty
      server.use(
        http.get(`/api/teams/${TEAM_ID}/audit-log`, ({ request }) => {
          const url = new URL(request.url);
          const cursor = url.searchParams.get('cursor');

          if (cursor === 'cursor-abc') {
            return HttpResponse.json({
              entries: [
                {
                  id: 'entry-0',
                  changeType: 'member_added',
                  previousValue: '',
                  newValue: 'New Member',
                  userId: 'member-1',
                  timestamp: '2025-01-14T08:00:00Z',
                },
              ],
              nextCursor: null,
            });
          }

          return HttpResponse.json({
            entries: mockEntries,
            nextCursor: 'cursor-abc',
          });
        })
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /load more/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /load more/i }));

      await waitFor(() => {
        expect(screen.getByText(/member_added/i)).toBeInTheDocument();
      });

      // All 3 entries should now be visible
      expect(screen.getAllByRole('article')).toHaveLength(3);

      // Load more button should be hidden after last page
      expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument();
    });
  });
});
