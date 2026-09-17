/**
 * Removing a member takes their way in with them.
 *
 * Requirements: Slack Sign In 4.4
 * Properties: 6 (removal revokes)
 *
 * Every other route in resolves through a row that is checked each time. A
 * Slack identity link is different: it is a standing statement that this Slack
 * account *is* this person, and if it outlives the membership it names, then
 * somebody removed from a team can still type a slash command and be handed a
 * session.
 *
 * Asserted against the in-memory repositories as well as the real ones,
 * because the two disagreed. The Prisma removal deletes the dependent rows in
 * its transaction; the fake removed the member and left them, so a unit test
 * could not have proved this property and a route test would have passed
 * against a fake that was less safe than production.
 */

import { describe, expect, it, beforeEach } from 'vitest';

import { createInMemoryRepositories, type Repositories } from '@/lib/repositories';
import { createAuthService, type AuthService } from '@/lib/services/auth.service';
import { createTeamService, type TeamService } from '@/lib/services/team.service';
import { InMemoryEmailService } from '@/lib/services/email.service';
import { resetRateLimitStore } from '@/lib/rate-limit';

let repos: Repositories;
let auth: AuthService;
let team: TeamService;

beforeEach(() => {
  resetRateLimitStore();
  repos = createInMemoryRepositories();
  auth = createAuthService({
    pairingCodeRepo: repos.pairingCode,
    magicLinkRepo: repos.magicLink,
    teamMemberRepo: repos.teamMember,
    userSessionRepo: repos.userSession,
    pendingGenesisRepo: repos.pendingGenesis,
    sessionLinkRepo: repos.sessionLink,
    sessionRepo: repos.session,
    slackIdentityLinkRepo: repos.slackIdentityLink,
    auditLogRepo: repos.auditLog,
    emailService: new InMemoryEmailService(),
  });
  team = createTeamService({
    teamRepo: repos.team,
    teamMemberRepo: repos.teamMember,
    teamMemberRoleRepo: repos.teamMemberRole,
    slackIdentityLinkRepo: repos.slackIdentityLink,
    auditLogRepo: repos.auditLog,
    sessionRepo: repos.session,
  });
});

/** A team with a manager who stays and a member who will be removed. */
async function teamWithLeaver() {
  const created = await repos.team.create({ name: 'Leaving Team' });
  const manager = await repos.teamMember.create({
    teamId: created.id,
    name: 'Manager',
    email: 'manager@leaving.test',
  });
  await repos.teamMemberRole.assign({
    memberId: manager.id,
    teamId: created.id,
    role: 'delivery_manager',
  });
  const leaver = await repos.teamMember.create({
    teamId: created.id,
    name: 'Leaver',
    email: 'leaver@leaving.test',
  });
  await repos.teamMemberRole.assign({
    memberId: leaver.id,
    teamId: created.id,
    role: 'team_member',
  });
  await repos.slackIdentityLink.create({ memberId: leaver.id, slackUserId: 'U_LEAVER' });
  return { teamId: created.id, manager, leaver };
}

describe('a member who has been removed', () => {
  it('cannot sign in from Slack any more', async () => {
    /*
     * The outcome, not the row. A test that only checked the link was gone
     * would pass against a sign-in path that resolved members some other way.
     */
    const { teamId, manager, leaver } = await teamWithLeaver();
    expect((await auth.requestSlackSignIn('U_LEAVER')).status).toBe('issued');

    await team.removeMember(teamId, leaver.id, manager.id);

    expect((await auth.requestSlackSignIn('U_LEAVER')).status).toBe('unlinked');
  });

  it('leaves no identity link behind', async () => {
    const { teamId, manager, leaver } = await teamWithLeaver();

    await team.removeMember(teamId, leaver.id, manager.id);

    expect(await repos.slackIdentityLink.findBySlackUserId('U_LEAVER')).toBeNull();
  });

  it('does not have access restored by being added again', async () => {
    /*
     * A link that survived removal would attach to the member id, and adding
     * somebody back creates a new one — so the danger is not that the old
     * member returns, it is that the old *link* is still pointing at a row
     * nobody can see.
     */
    const { teamId, manager, leaver } = await teamWithLeaver();
    await team.removeMember(teamId, leaver.id, manager.id);

    const readded = await repos.teamMember.create({
      teamId,
      name: 'Leaver',
      email: 'leaver@leaving.test',
    });

    expect(await repos.slackIdentityLink.findByMemberId(readded.id)).toBeNull();
    expect((await auth.requestSlackSignIn('U_LEAVER')).status).toBe('unlinked');
  });

  it('cannot use a sign-in link issued before they left', async () => {
    /*
     * The token was minted while they were a member. Removal has to reach it,
     * or there is a window in which somebody who has just been removed still
     * holds a working credential in their Slack history.
     */
    const { teamId, manager, leaver } = await teamWithLeaver();
    const issued = await auth.requestSlackSignIn('U_LEAVER');
    if (issued.status !== 'issued') throw new Error('expected a token');

    await team.removeMember(teamId, leaver.id, manager.id);

    await expect(auth.verifyMagicLink(issued.token)).rejects.toThrow();
  });

  it('does not keep a browser session that was already open', async () => {
    // Requirement 4.4 covers the standing statement; a live cookie is the
    // same problem one step further on
    const { teamId, manager, leaver } = await teamWithLeaver();
    await repos.userSession.create({
      memberId: leaver.id,
      token: 'leaver-session',
      expiresAt: new Date(Date.now() + 60_000),
    });

    await team.removeMember(teamId, leaver.id, manager.id);

    expect(await repos.userSession.findByToken('leaver-session')).toBeNull();
  });

  it('leaves everybody else able to sign in', async () => {
    // A removal that revoked too broadly would be its own outage
    const { teamId, manager, leaver } = await teamWithLeaver();
    await repos.slackIdentityLink.create({ memberId: manager.id, slackUserId: 'U_MANAGER' });

    await team.removeMember(teamId, leaver.id, manager.id);

    expect((await auth.requestSlackSignIn('U_MANAGER')).status).toBe('issued');
  });
});
