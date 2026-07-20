/**
 * Tests for Team Management Settings Page
 *
 * Requirements: 1.1, 1.3, 1.6, 1.7, 2.7, 3.1, 14.4, 19.5
 * - Team name/description editing
 * - Privacy mode toggle with confirmation
 * - Member list with add/remove, role assignment, Slack link status
 * - Schedule configuration
 * - Slack delivery window configuration
 */

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, it, expect, beforeEach } from 'vitest';

import { server } from '@/tests/mocks/server';

import TeamSettingsPage from './page';

const TEAM_ID = 'team-123';

const mockTeam = {
  id: TEAM_ID,
  name: 'Alpha Squad',
  description: 'Delivery team for GDS project',
  privacyMode: 'anonymous',
  slackDeliveryStart: '09:00',
  slackDeliveryEnd: '17:00',
  timezone: 'Europe/London',
};

const mockMembers = [
  {
    id: 'member-1',
    name: 'Alice Smith',
    email: 'alice@example.com',
    roles: [{ role: 'delivery_manager' }],
    slackLink: { slackUserId: 'U123' },
  },
  {
    id: 'member-2',
    name: 'Bob Jones',
    email: 'bob@example.com',
    roles: [{ role: 'team_member' }],
    slackLink: null,
  },
];

const mockSchedule = {
  schedule: {
    cadence: 'weekly',
    openDay: 1,
    openTime: '09:00',
    closeDay: 5,
    closeTime: '17:00',
    timezone: 'Europe/London',
  },
};

function setupHandlers() {
  server.use(
    http.get(`/api/teams/${TEAM_ID}`, () => HttpResponse.json(mockTeam)),
    http.get(`/api/teams/${TEAM_ID}/members`, () => HttpResponse.json(mockMembers)),
    http.get(`/api/teams/${TEAM_ID}/schedule`, () => HttpResponse.json(mockSchedule)),
    http.patch(`/api/teams/${TEAM_ID}`, async ({ request }) => {
      const body = await request.json() as Record<string, unknown>;
      return HttpResponse.json({ ...mockTeam, ...body });
    }),
    http.post(`/api/teams/${TEAM_ID}/members`, async ({ request }) => {
      const body = await request.json() as Record<string, unknown>;
      return HttpResponse.json(
        { id: 'member-new', ...body, roles: [{ role: 'team_member' }], slackLink: null },
        { status: 201 }
      );
    }),
    http.delete(`/api/teams/${TEAM_ID}/members/:memberId`, () =>
      HttpResponse.json({ removed: true })
    ),
    http.patch(`/api/teams/${TEAM_ID}/members/:memberId`, async ({ request }) => {
      const body = await request.json() as Record<string, unknown>;
      return HttpResponse.json({ ...mockMembers[1], ...body });
    }),
    http.put(`/api/teams/${TEAM_ID}/schedule`, async ({ request }) => {
      const body = await request.json() as Record<string, unknown>;
      return HttpResponse.json(body);
    }),
  );
}

function renderPage() {
  const params = Promise.resolve({ teamId: TEAM_ID });
  return render(<TeamSettingsPage params={params} />);
}

describe('Team Settings Page', () => {
  beforeEach(() => {
    setupHandlers();
  });

  describe('Loading and Layout', () => {
    it('renders loading state initially', () => {
      renderPage();
      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });

    it('renders team settings heading after load', async () => {
      renderPage();
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /team settings/i })).toBeInTheDocument();
      });
    });
  });

  describe('Team Details Section (Req 1.1)', () => {
    it('displays team name and description', async () => {
      renderPage();
      await waitFor(() => {
        expect(screen.getByDisplayValue('Alpha Squad')).toBeInTheDocument();
        expect(screen.getByDisplayValue('Delivery team for GDS project')).toBeInTheDocument();
      });
    });

    it('allows editing team name and saves via PATCH', async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByDisplayValue('Alpha Squad')).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText(/team name/i);
      await user.clear(nameInput);
      await user.type(nameInput, 'Beta Squad');

      const saveBtn = screen.getAllByRole('button', { name: /save/i })[0];
      await user.click(saveBtn);

      await waitFor(() => {
        expect(screen.getByDisplayValue('Beta Squad')).toBeInTheDocument();
      });
    });
  });

  describe('Privacy Mode Section (Req 14.4)', () => {
    it('displays current privacy mode', async () => {
      renderPage();
      await waitFor(() => {
        expect(screen.getByText(/anonymous/i)).toBeInTheDocument();
      });
    });

    it('shows confirmation dialog when switching to attributed', async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByText(/anonymous/i)).toBeInTheDocument();
      });

      const toggleBtn = screen.getByRole('button', { name: /switch to attributed/i });
      await user.click(toggleBtn);

      expect(screen.getByText(/are you sure/i)).toBeInTheDocument();
    });

    it('sends PATCH when confirming privacy mode change', async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByText(/anonymous/i)).toBeInTheDocument();
      });

      const toggleBtn = screen.getByRole('button', { name: /switch to attributed/i });
      await user.click(toggleBtn);

      const confirmBtn = screen.getByRole('button', { name: /confirm/i });
      await user.click(confirmBtn);

      await waitFor(() => {
        expect(screen.getByText(/attributed/i)).toBeInTheDocument();
      });
    });
  });

  describe('Members Section (Req 1.3, 1.6, 1.7, 2.7, 19.5)', () => {
    it('displays list of team members', async () => {
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Alice Smith')).toBeInTheDocument();
        expect(screen.getByText('Bob Jones')).toBeInTheDocument();
      });
    });

    it('shows Slack link status for each member', async () => {
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Alice Smith')).toBeInTheDocument();
      });

      // Alice has Slack linked
      const aliceRow = screen.getByText('Alice Smith').closest('[data-testid="member-row"]') as HTMLElement;
      expect(within(aliceRow).getByText(/linked/i)).toBeInTheDocument();

      // Bob does not have Slack linked
      const bobRow = screen.getByText('Bob Jones').closest('[data-testid="member-row"]') as HTMLElement;
      expect(within(bobRow).getByText(/not linked/i)).toBeInTheDocument();
    });

    it('allows adding a new member', async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Alice Smith')).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText(/member name/i);
      const emailInput = screen.getByLabelText(/member email/i);
      const addBtn = screen.getByRole('button', { name: /add member/i });

      await user.type(nameInput, 'Charlie');
      await user.type(emailInput, 'charlie@example.com');
      await user.click(addBtn);

      await waitFor(() => {
        expect(screen.getByText('Charlie')).toBeInTheDocument();
      });
    });

    it('allows removing a member with confirmation', async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Bob Jones')).toBeInTheDocument();
      });

      const bobRow = screen.getByText('Bob Jones').closest('[data-testid="member-row"]') as HTMLElement;
      const removeBtn = within(bobRow).getByRole('button', { name: /remove/i });
      await user.click(removeBtn);

      // Confirmation dialog
      expect(screen.getByText(/remove bob jones/i)).toBeInTheDocument();
      const confirmBtn = screen.getByRole('button', { name: /confirm/i });
      await user.click(confirmBtn);

      await waitFor(() => {
        expect(screen.queryByText('Bob Jones')).not.toBeInTheDocument();
      });
    });

    it('shows role assignment dropdown for each member', async () => {
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Alice Smith')).toBeInTheDocument();
      });

      const aliceRow = screen.getByText('Alice Smith').closest('[data-testid="member-row"]') as HTMLElement;
      const roleSelect = within(aliceRow).getByRole('combobox');
      expect(roleSelect).toHaveValue('delivery_manager');
    });
  });

  describe('Schedule Section (Req 3.1)', () => {
    it('displays existing schedule configuration', async () => {
      renderPage();
      await waitFor(() => {
        expect(screen.getByLabelText(/open day/i)).toHaveValue('1');
        expect(screen.getByLabelText(/open time/i)).toHaveValue('09:00');
        expect(screen.getByLabelText(/close day/i)).toHaveValue('5');
        expect(screen.getByLabelText(/close time/i)).toHaveValue('17:00');
      });
    });

    it('allows saving schedule changes', async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/open day/i)).toHaveValue('1');
      });

      const openDay = screen.getByLabelText(/open day/i);
      await user.selectOptions(openDay, '2');

      const saveScheduleBtn = screen.getByRole('button', { name: /save schedule/i });
      await user.click(saveScheduleBtn);

      await waitFor(() => {
        expect(screen.getByLabelText(/open day/i)).toHaveValue('2');
      });
    });
  });

  describe('Slack Delivery Window (Req 5.1)', () => {
    it('displays existing Slack delivery window', async () => {
      renderPage();
      await waitFor(() => {
        expect(screen.getByLabelText(/delivery start/i)).toHaveValue('09:00');
        expect(screen.getByLabelText(/delivery end/i)).toHaveValue('17:00');
      });
    });

    it('allows saving delivery window changes', async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/delivery start/i)).toHaveValue('09:00');
      });

      const startInput = screen.getByLabelText(/delivery start/i);
      await user.clear(startInput);
      await user.type(startInput, '10:00');

      const saveBtn = screen.getByRole('button', { name: /save delivery window/i });
      await user.click(saveBtn);

      await waitFor(() => {
        expect(screen.getByDisplayValue('10:00')).toBeInTheDocument();
      });
    });
  });
});
