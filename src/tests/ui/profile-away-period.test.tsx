/**
 * An away period a member can see, and cancel.
 *
 * Requirements: Explaining Itself 5.1, 5.2, 5.3, 5.4, 5.5
 *
 * Availability could be set and then neither seen nor undone. The service has
 * had `getAvailability` since availability was built and no route ever called
 * it, so the page offered two date fields, took the dates, said "Away period
 * saved" and forgot them. A member who changed their plans had nowhere to go.
 *
 * The dates come from the API and are asserted as the API's, not as anything
 * the page could have invented — the profile once rendered a `privacyMode` the
 * API had never sent, and a mock that agreed with the page kept it green.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';

import { server } from '../mocks/server';
import ProfilePage from '@/app/me/page';

const MOCK_PROFILE = {
  id: 'member-1',
  teamId: 'team-1',
  name: 'Alice',
  email: 'alice@example.com',
  cadencePreference: 'session',
  remindersEnabled: true,
  currentStreak: 5,
  bestStreak: 8,
  slackLink: null,
  team: { id: 'team-1', name: 'Platform Squad', privacyMode: 'anonymous' },
  roles: ['team_member'],
};

/** Mirrors `GET /api/me/availability`, which sends dates as ISO strings. */
const AWAY = {
  id: 'availability-1',
  memberId: 'member-1',
  awayFrom: '2026-10-05T00:00:00.000Z',
  awayUntil: '2026-10-12T00:00:00.000Z',
};

function mockApis(away: unknown[] = []) {
  server.use(
    http.get('/api/me', () => HttpResponse.json(MOCK_PROFILE)),
    http.get('/api/me/streak', () => HttpResponse.json({ currentStreak: 5, bestStreak: 8 })),
    http.get('/api/me/availability', () => HttpResponse.json(away)),
  );
}

async function renderProfile() {
  render(<ProfilePage />);
  await waitFor(() => {
    expect(screen.getByRole('heading', { level: 1, name: /profile/i })).toBeInTheDocument();
  });
}

function availabilitySection() {
  return screen.getByRole('region', { name: /availability/i });
}

describe('an away period that is set', () => {
  beforeEach(() => mockApis([AWAY]));

  it('is shown at all', async () => {
    // Requirement 5.1
    await renderProfile();

    await waitFor(() => {
      expect(within(availabilitySection()).getByText(/you are away/i)).toBeInTheDocument();
    });
  });

  it('carries the dates it was set with', async () => {
    /*
     * Requirement 5.1. October 5th to 12th are the API's dates and nothing
     * else on the page knows them, so the assertion cannot pass on a value the
     * page made up.
     */
    await renderProfile();

    await waitFor(() => {
      const shown = availabilitySection().textContent ?? '';
      expect(shown).toMatch(/5 October 2026/);
      expect(shown).toMatch(/12 October 2026/);
    });
  });

  it('reads them from the API rather than assuming', async () => {
    // Different dates, same page: whatever the API says is what appears
    server.use(
      http.get('/api/me/availability', () =>
        HttpResponse.json([
          { ...AWAY, awayFrom: '2027-01-02T00:00:00.000Z', awayUntil: '2027-01-09T00:00:00.000Z' },
        ]),
      ),
    );
    await renderProfile();

    await waitFor(() => {
      expect(availabilitySection().textContent).toMatch(/2 January 2027/);
    });
  });
});

describe('no away period', () => {
  beforeEach(() => mockApis([]));

  it('says so rather than leaving the space blank', async () => {
    // Requirement 5.3, and NFR 3.2 — a state that renders as nothing is
    // unfinished, not acceptable
    await renderProfile();

    await waitFor(() => {
      expect(within(availabilitySection()).getByText(/not marked yourself away/i)).toBeVisible();
    });
  });

  it('offers no cancel control, since there is nothing to cancel', async () => {
    await renderProfile();

    await waitFor(() => {
      expect(within(availabilitySection()).getByText(/not marked yourself away/i)).toBeVisible();
    });
    expect(screen.queryByRole('button', { name: /cancel away/i })).not.toBeInTheDocument();
  });
});

describe('cancelling an away period', () => {
  beforeEach(() => mockApis([AWAY]));

  it('removes it from the page', async () => {
    // Requirement 5.2
    let deleted: unknown = null;
    server.use(
      http.delete('/api/me/availability', async ({ request }) => {
        deleted = await request.json();
        return HttpResponse.json({ success: true });
      }),
      http.get('/api/me/availability', () => HttpResponse.json(deleted ? [] : [AWAY])),
    );
    const user = userEvent.setup();
    await renderProfile();

    const cancel = await screen.findByRole('button', { name: /cancel away/i });
    await user.click(cancel);

    await waitFor(() => {
      expect(within(availabilitySection()).getByText(/not marked yourself away/i)).toBeVisible();
    });
  });

  it('names the period it is cancelling, not whichever one the server guesses', async () => {
    /*
     * Requirement 5.4. A cancel that sends no id would have the server pick,
     * and a member with two periods would watch the wrong one disappear.
     */
    let body: { availabilityId?: string } | null = null;
    server.use(
      http.delete('/api/me/availability', async ({ request }) => {
        body = (await request.json()) as { availabilityId?: string };
        return HttpResponse.json({ success: true });
      }),
    );
    const user = userEvent.setup();
    await renderProfile();

    await user.click(await screen.findByRole('button', { name: /cancel away/i }));

    await waitFor(() => expect(body).not.toBeNull());
    expect(body!.availabilityId).toBe('availability-1');
  });

  it('says what went wrong rather than appearing to have worked', async () => {
    // A cancel that failed silently leaves a member believing they will be
    // prompted when they will not be
    server.use(
      http.delete('/api/me/availability', () =>
        HttpResponse.json({ error: { message: 'no' } }, { status: 500 }),
      ),
    );
    const user = userEvent.setup();
    await renderProfile();

    await user.click(await screen.findByRole('button', { name: /cancel away/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be cancelled/i);
  });
});

describe('marking away', () => {
  beforeEach(() => mockApis([]));

  it('shows the period it just created without a reload', async () => {
    /*
     * The old page said "Away period saved" and showed nothing, which is the
     * same silence from the other direction: a member had only the message to
     * go on, and no way to check it was the period they meant.
     */
    let created = false;
    server.use(
      http.post('/api/me/availability', () => {
        created = true;
        return HttpResponse.json(AWAY, { status: 201 });
      }),
      http.get('/api/me/availability', () => HttpResponse.json(created ? [AWAY] : [])),
    );
    const user = userEvent.setup();
    await renderProfile();

    await user.type(screen.getByLabelText(/away from/i), '2026-10-05');
    await user.type(screen.getByLabelText(/away until/i), '2026-10-12');
    await user.click(screen.getByRole('button', { name: /mark away/i }));

    await waitFor(() => {
      expect(availabilitySection().textContent).toMatch(/5 October 2026/);
    });
  });
});
