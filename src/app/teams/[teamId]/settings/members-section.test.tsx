import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { server } from '@/tests/mocks/server';

import { MembersSection, type Member } from './members-section';

const complete: Member = {
  id: 'manager',
  teamId: 'team-1',
  name: 'Complete manager',
  email: 'manager@example.com',
  roles: [{ role: 'delivery_manager' }],
  slackLink: { slackUserId: 'U123' },
};

function renderMembers(members: Member[]) {
  const onMembersChanged = vi.fn();
  render(<MembersSection teamId="team-1" members={members} onMembersChanged={onMembersChanged} />);
  return onMembersChanged;
}

describe('MembersSection contract hardening', () => {
  it('renders complete and omitted legacy relation fields without crashing', () => {
    const legacy = { id: 'legacy', teamId: 'team-1', name: 'Legacy member' } as unknown as Member;

    renderMembers([complete, legacy]);

    expect(screen.getByText('Complete manager')).toBeInTheDocument();
    const legacyRow = screen.getByText('Legacy member').closest('[data-testid="member-row"]') as HTMLElement;
    expect(within(legacyRow).getByText('Slack not linked')).toBeInTheDocument();
    expect(within(legacyRow).getByRole('combobox')).toHaveValue('team_member');
  });

  it('updates role state only from the successful member-summary response', async () => {
    const user = userEvent.setup();
    const changed = renderMembers([{ ...complete, id: 'member', roles: [{ role: 'team_member' }] }]);
    server.use(http.patch('/api/teams/team-1/members/member', () => HttpResponse.json({
      ...complete,
      id: 'member',
      roles: [{ role: 'delivery_manager' }],
    })));

    await user.selectOptions(screen.getByRole('combobox'), 'delivery_manager');

    await waitFor(() => expect(changed).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'member', roles: [{ role: 'delivery_manager' }] }),
    ]));
  });

  it('shows structured role and remove errors without changing members', async () => {
    const user = userEvent.setup();
    const changed = renderMembers([complete]);
    server.use(
      http.patch('/api/teams/team-1/members/manager', () => HttpResponse.json({ error: { code: 'CONFLICT', message: 'At least one delivery manager must remain' } }, { status: 409 })),
      http.delete('/api/teams/team-1/members/manager', () => HttpResponse.json({ error: { code: 'CONFLICT', message: 'Cannot remove the final delivery manager' } }, { status: 409 })),
    );

    await user.selectOptions(screen.getByRole('combobox'), 'team_member');
    expect(await screen.findByRole('alert')).toHaveTextContent('At least one delivery manager must remain');
    expect(changed).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Remove' }));
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot remove the final delivery manager');
    expect(changed).not.toHaveBeenCalled();
  });
});

describe('MembersSection add errors', () => {
  it('renders structured add-member validation errors', async () => {
    const user = userEvent.setup();
    const changed = renderMembers([complete]);
    server.use(http.post('/api/teams/team-1/members', () => HttpResponse.json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        errors: [{ field: 'email', message: 'Enter a valid email', code: 'invalid_format' }],
      },
    }, { status: 400 })));

    await user.type(screen.getByLabelText('Member name'), 'New member');
    await user.type(screen.getByLabelText('Member email'), 'invalid');
    await user.click(screen.getByRole('button', { name: 'Add member' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Validation failed');
    expect(changed).not.toHaveBeenCalled();
  });
});
