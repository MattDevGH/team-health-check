/**
 * Recording a member's Slack account from team settings.
 *
 * Requirements: Slack Sign In 2.1, 2.4, 2.5, NFR 3.1
 *
 * The page already explained that linking was something only the member could
 * do — which was true, and is exactly what made the tool unusable without
 * email. A manager can assert it now, and the page has to say how much that
 * means: it records who a Slack account belongs to, and grants the manager
 * nothing.
 */

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { server } from '@/tests/mocks/server';

import { MembersSection, type Member } from './members-section';

expect.extend(toHaveNoViolations);

const unlinked: Member = {
  id: 'member-1',
  teamId: 'team-1',
  name: 'Unlinked Member',
  email: 'unlinked@example.com',
  roles: [{ role: 'team_member' }],
  slackLink: null,
};

function renderMembers(members: Member[] = [unlinked]) {
  const onMembersChanged = vi.fn();
  render(<MembersSection teamId="team-1" members={members} onMembersChanged={onMembersChanged} />);
  return onMembersChanged;
}

function rowFor(name: string): HTMLElement {
  return screen.getByText(name).closest('[data-testid="member-row"]') as HTMLElement;
}

async function saveId(value: string): Promise<void> {
  const user = userEvent.setup();
  const row = rowFor('Unlinked Member');
  await user.type(within(row).getByLabelText(/slack member id/i), value);
  await user.click(within(row).getByRole('button', { name: /save slack id/i }));
}

describe('what the page says a binding means', () => {
  it('says a manager can record it', () => {
    renderMembers();

    expect(screen.getByText(/you can record it for them/i)).toBeInTheDocument();
  });

  it('says recording it does not let the manager sign in as that member', () => {
    /*
     * Requirement 2.4, stated to the person doing it. Asserting somebody's
     * identity and being able to act as them are different powers, and a
     * manager who conflates them will over- or under-use this.
     */
    renderMembers();

    expect(screen.getByText(/does not let you sign in as them/i)).toBeInTheDocument();
  });

  it('no longer claims only the member can link their account', () => {
    /*
     * The page said "Only they can do this; it is not something you can set on
     * their behalf." True until this existed, and leaving it would have the
     * page contradicting the control directly beneath it.
     */
    renderMembers();

    expect(screen.queryByText(/not something you can set on their behalf/i)).toBeNull();
  });
});

describe('recording a Slack account', () => {
  it('offers a control for each member', () => {
    renderMembers();

    expect(within(rowFor('Unlinked Member')).getByLabelText(/slack member id/i)).toBeInTheDocument();
  });

  it('sends the id the manager typed', async () => {
    let sent: { slackUserId?: string | null } | null = null;
    server.use(
      http.put('/api/teams/team-1/members/member-1', async ({ request }) => {
        sent = (await request.json()) as { slackUserId?: string | null };
        return HttpResponse.json({ ...unlinked, slackLink: { slackUserId: 'U123ABC' } });
      }),
    );
    renderMembers();

    await saveId('U123ABC');

    await waitFor(() => expect(sent).not.toBeNull());
    expect(sent!.slackUserId).toBe('U123ABC');
  });

  it('reports the link upwards from the server’s answer, not from the click', async () => {
    /*
     * `MembersSection` is controlled — the page owns the members and this
     * reports changes to it. So the observable outcome is what it hands back,
     * and it has to be the member the *server* returned: a row that showed
     * "Slack linked" because a button was pressed would be reporting an
     * intention rather than a fact.
     *
     * The first version of this test waited for the row to change and timed
     * out, because a spy parent never re-renders.
     */
    server.use(
      http.put('/api/teams/team-1/members/member-1', () =>
        HttpResponse.json({ ...unlinked, slackLink: { slackUserId: 'U123ABC' } }),
      ),
    );
    const changed = renderMembers();

    await saveId('U123ABC');

    await waitFor(() =>
      expect(changed).toHaveBeenCalledWith([
        expect.objectContaining({ id: 'member-1', slackLink: { slackUserId: 'U123ABC' } }),
      ]),
    );
  });

  it('says what went wrong when the id belongs to somebody else', async () => {
    /*
     * The conflict a manager is most likely to cause, by copying the wrong id.
     * Silence here would leave them believing it worked.
     */
    server.use(
      http.put('/api/teams/team-1/members/member-1', () =>
        HttpResponse.json(
          {
            error: {
              code: 'CONFLICT',
              message: 'That Slack account is already linked to another member',
            },
          },
          { status: 409 },
        ),
      ),
    );
    renderMembers();

    await saveId('U123ABC');

    expect(await screen.findByRole('alert')).toHaveTextContent(/already linked to another member/i);
  });

  it('leaves the member unlinked when the server refuses', async () => {
    server.use(
      http.put('/api/teams/team-1/members/member-1', () =>
        HttpResponse.json({ error: { code: 'CONFLICT', message: 'nope' } }, { status: 409 }),
      ),
    );
    const changed = renderMembers();

    await saveId('U123ABC');

    await screen.findByRole('alert');
    expect(within(rowFor('Unlinked Member')).getByText('Slack not linked')).toBeInTheDocument();
    expect(changed).not.toHaveBeenCalled();
  });

  it('offers to clear an account that is already linked', async () => {
    let sent: { slackUserId?: string | null } | null = null;
    server.use(
      http.put('/api/teams/team-1/members/member-1', async ({ request }) => {
        sent = (await request.json()) as { slackUserId?: string | null };
        return HttpResponse.json({ ...unlinked, slackLink: null });
      }),
    );
    const user = userEvent.setup();
    renderMembers([{ ...unlinked, slackLink: { slackUserId: 'U123ABC' } }]);

    await user.click(
      within(rowFor('Unlinked Member')).getByRole('button', { name: /unlink slack/i }),
    );

    await waitFor(() => expect(sent).not.toBeNull());
    expect(sent!.slackUserId).toBeNull();
  });
});

describe('the control as somebody without a mouse meets it', () => {
  it('is reachable and operable by keyboard alone', async () => {
    // NFR 3.1. A control only a mouse can reach is a control half the standing
    // bar does not cover
    let sent = false;
    server.use(
      http.put('/api/teams/team-1/members/member-1', () => {
        sent = true;
        return HttpResponse.json({ ...unlinked, slackLink: { slackUserId: 'U123ABC' } });
      }),
    );
    const user = userEvent.setup();
    renderMembers();

    within(rowFor('Unlinked Member')).getByLabelText(/slack member id/i).focus();
    await user.keyboard('U123ABC');
    await user.tab();
    await user.keyboard('{Enter}');

    await waitFor(() => expect(sent).toBe(true));
  });

  it('has no axe-detectable violations', async () => {
    const { container } = render(
      <MembersSection teamId="team-1" members={[unlinked]} onMembersChanged={vi.fn()} />,
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});
