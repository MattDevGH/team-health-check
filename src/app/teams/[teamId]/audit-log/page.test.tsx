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

/**
 * Mirrors an entry as the route now returns it: the stored `userId` plus the
 * `actor` the service resolves on the way out. `name` is nullable because a
 * former member and an erased account genuinely cannot be named.
 */
interface AuditEntryFixture {
  id: string;
  changeType: string;
  previousValue: string;
  newValue: string;
  userId: string;
  actor: { id: string; name: string | null; isViewer: boolean; isErased: boolean };
  timestamp: string;
}

const mockEntries: AuditEntryFixture[] = [
  {
    id: 'entry-2',
    changeType: 'privacy_mode_changed',
    previousValue: 'anonymous',
    newValue: 'attributed',
    userId: 'member-1',
    actor: { id: 'member-1', name: 'Priya', isViewer: false, isErased: false },
    timestamp: '2025-01-16T14:00:00Z',
  },
  {
    id: 'entry-1',
    changeType: 'schedule_changed',
    previousValue: 'weekly',
    newValue: 'fortnightly',
    userId: 'member-1',
    actor: { id: 'member-1', name: 'Matt', isViewer: true, isErased: false },
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

    it('names the person who made the change, never their id', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getAllByRole('article')[0]).toHaveTextContent('Changed by: Priya');
      });
      // Reading the log should not require a database
      expect(screen.getAllByRole('article')[0]).not.toHaveTextContent('member-1');
    });

    it('says "You" for the reader’s own changes', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getAllByRole('article')[1]).toHaveTextContent('Changed by: You');
      });
    });

    it('says a former member cannot be named, rather than showing an id', async () => {
      setupHandlers({
        entries: [
          {
            ...mockEntries[0],
            actor: { id: 'gone', name: null, isViewer: false, isErased: false },
          },
        ],
      });
      renderPage();

      await waitFor(() => {
        expect(screen.getAllByRole('article')[0]).toHaveTextContent('Changed by: A former member');
      });
    });

    it('describes an erased account as deleted', async () => {
      // The GDPR path stores deleted:<hash> so the actor cannot be identified;
      // the log says so rather than printing the hash
      setupHandlers({
        entries: [
          {
            ...mockEntries[0],
            actor: { id: 'deleted:9f8a', name: null, isViewer: false, isErased: true },
          },
        ],
      });
      renderPage();

      await waitFor(() => {
        expect(screen.getAllByRole('article')[0]).toHaveTextContent(
          'Changed by: A deleted account',
        );
      });
      expect(screen.getAllByRole('article')[0]).not.toHaveTextContent('9f8a');
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

/**
 * The audit log is read by a person, months later.
 *
 * Requirements: 18.4
 *
 * Three findings from reading a real production log on 2026-09-14, none of which
 * failed a test.
 *
 * A first schedule rendered as `null→{"cadence":"weekly",…}`. `null` is a
 * database artefact — `team.service.ts` writes the literal string for a first
 * configuration — and this is the one screen whose entire job is being
 * understood by a human reader later.
 *
 * The values ran past the right edge of their card. Audit values are JSON by
 * design, so they are long and unbroken, and this will only get worse.
 *
 * And an arrow between two unlabelled blobs asks the reader to infer which is
 * which. `aria-label="changed to"` on a decorative span does less than it looks.
 */
describe('Audit entries a person can read', () => {
  beforeEach(() => {
    setupHandlers();
  });

  it('says what there was before, rather than showing a bare arrow', async () => {
    renderPage();

    await waitFor(() => expect(screen.getAllByRole('article').length).toBeGreaterThan(0));
    const [entry] = screen.getAllByRole('article');

    expect(entry).toHaveTextContent(/before/i);
    expect(entry).toHaveTextContent(/after/i);
  });

  it('says "no previous value" rather than null for a first configuration', async () => {
    server.use(
      http.get('/api/teams/:teamId/audit-log', () =>
        HttpResponse.json({
          entries: [
            {
              id: 'first',
              teamId: TEAM_ID,
              changeType: 'schedule_change',
              previousValue: 'null',
              newValue: '{"cadence":"weekly"}',
              userId: 'member-1',
              timestamp: '2026-09-14T14:25:00.000Z',
              actor: { id: 'member-1', name: 'Matt', isViewer: true, isErased: false },
            },
          ],
          nextCursor: null,
        }),
      ),
    );
    renderPage();

    await waitFor(() => expect(screen.getAllByRole('article').length).toBeGreaterThan(0));
    const [entry] = screen.getAllByRole('article');

    expect(entry).not.toHaveTextContent(/null/);
    expect(entry).toHaveTextContent(/no previous value/i);
  });

  it('treats an empty previous value the same way', async () => {
    // Two routes write "nothing was there before": the literal string "null"
    // from a first schedule, and '' from team creation and member addition
    server.use(
      http.get('/api/teams/:teamId/audit-log', () =>
        HttpResponse.json({
          entries: [
            {
              id: 'created',
              teamId: TEAM_ID,
              changeType: 'team_created',
              previousValue: '',
              newValue: '{"name":"FCRM AI Labs"}',
              userId: 'member-1',
              timestamp: '2026-09-14T14:20:00.000Z',
              actor: { id: 'member-1', name: 'Matt', isViewer: true, isErased: false },
            },
          ],
          nextCursor: null,
        }),
      ),
    );
    renderPage();

    await waitFor(() => expect(screen.getAllByRole('article').length).toBeGreaterThan(0));

    expect(screen.getAllByRole('article')[0]).toHaveTextContent(/no previous value/i);
  });

  it('lets a long unbroken value wrap instead of leaving its card', async () => {
    // A schedule is one long JSON string with no spaces to break on, so the
    // default wrapping does nothing and it overflows
    const { container } = renderPage();

    await waitFor(() => expect(screen.getAllByRole('article').length).toBeGreaterThan(0));

    const values = container.querySelectorAll('[data-audit-value]');
    expect(values.length).toBeGreaterThan(0);
    for (const value of values) {
      expect(value.className).toMatch(/break-all|break-words/);
    }
  });
});
