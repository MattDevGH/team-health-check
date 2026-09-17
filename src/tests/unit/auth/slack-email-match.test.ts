/**
 * Slack asserts the binding, from an email it has already verified.
 *
 * Requirements: Slack Sign In 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.1, 4.2
 * Properties: 1 (no Slack interaction creates a team member), 4 (ambiguity refuses)
 *
 * Phase 2 made a trial possible: a manager records each binding by hand. This
 * makes it self-service, and removes email from the critical path for good.
 *
 * The danger it introduces is the one Requirement 4 is about. Being in a Slack
 * workspace is not being on a team, and a matching email must never be allowed
 * to *create* membership — inviting a contractor to a channel cannot also
 * invite them to a team's candid feedback.
 */

import { describe, expect, it, beforeEach } from 'vitest';

import { createInMemoryRepositories, type Repositories } from '@/lib/repositories';
import { createAuthService, type AuthService } from '@/lib/services/auth.service';
import { InMemoryEmailService } from '@/lib/services/email.service';
import { resetRateLimitStore } from '@/lib/rate-limit';
import type { SlackUserDirectory } from '@/lib/slack/user-directory';

let repos: Repositories;
let auth: AuthService;

/** A directory that answers with whatever this test decided. */
function directory(emails: Record<string, string | null>): SlackUserDirectory {
  return { emailFor: async slackUserId => emails[slackUserId] ?? null };
}

function build(slackUserDirectory?: SlackUserDirectory): AuthService {
  return createAuthService({
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
    slackUserDirectory,
  });
}

beforeEach(() => {
  resetRateLimitStore();
  repos = createInMemoryRepositories();
  auth = build();
});

async function memberOnTeam(teamName: string, email: string) {
  const team = await repos.team.create({ name: teamName });
  const created = await repos.teamMember.create({ teamId: team.id, name: 'Member', email });
  return { team, member: created };
}

describe('an unlinked Slack user whose email matches one member', () => {
  it('is signed in without anybody setting them up', async () => {
    const { member } = await memberOnTeam('Match Team', 'alice@example.invalid');
    auth = build(directory({ U_ALICE: 'alice@example.invalid' }));

    const result = await auth.requestSlackSignIn('U_ALICE');
    if (result.status !== 'issued') throw new Error('expected a token');

    await expect(auth.verifyMagicLink(result.token)).resolves.toMatchObject({
      status: 'authenticated',
      memberId: member.id,
    });
  });

  it('is linked, so the next request needs no lookup', async () => {
    const { member } = await memberOnTeam('Match Team', 'alice@example.invalid');
    auth = build(directory({ U_ALICE: 'alice@example.invalid' }));

    await auth.requestSlackSignIn('U_ALICE');

    expect(await repos.slackIdentityLink.findBySlackUserId('U_ALICE')).toMatchObject({
      memberId: member.id,
    });
  });

  it('matches regardless of case, since an address is not case sensitive', async () => {
    const { member } = await memberOnTeam('Match Team', 'alice@example.invalid');
    auth = build(directory({ U_ALICE: 'ALICE@Example.Invalid' }));

    const result = await auth.requestSlackSignIn('U_ALICE');
    if (result.status !== 'issued') throw new Error('expected a token');

    expect(await repos.slackIdentityLink.findBySlackUserId('U_ALICE')).toMatchObject({
      memberId: member.id,
    });
  });

  it('matches the whole address and nothing less', async () => {
    /*
     * Requirement 3.4. Prefix or domain matching would mean anybody in the
     * workspace with an address at the same company could sign in as a
     * colleague — which is the entire risk this feature carries.
     */
    await memberOnTeam('Match Team', 'alice@example.invalid');
    auth = build(directory({ U_OTHER: 'alice@example.invalid.attacker.test' }));

    expect((await auth.requestSlackSignIn('U_OTHER')).status).toBe('unlinked');
  });

  it('does not match a different local part at the same domain', async () => {
    await memberOnTeam('Match Team', 'alice@example.invalid');
    auth = build(directory({ U_BOB: 'bob@example.invalid' }));

    expect((await auth.requestSlackSignIn('U_BOB')).status).toBe('unlinked');
  });
});

describe('an email that matches more than one team', () => {
  it('issues nothing', async () => {
    /*
     * Requirement 3.3 and Property 4. The schema permits one address on
     * members of two teams, and the magic-link route already refuses rather
     * than choosing arbitrarily — choosing here would sign somebody into a
     * team at random.
     */
    await memberOnTeam('First Team', 'shared@example.invalid');
    await memberOnTeam('Second Team', 'shared@example.invalid');
    auth = build(directory({ U_SHARED: 'shared@example.invalid' }));

    expect((await auth.requestSlackSignIn('U_SHARED')).status).not.toBe('issued');
  });

  it('creates no identity link, so the ambiguity is not resolved by accident', async () => {
    await memberOnTeam('First Team', 'shared@example.invalid');
    await memberOnTeam('Second Team', 'shared@example.invalid');
    auth = build(directory({ U_SHARED: 'shared@example.invalid' }));

    await auth.requestSlackSignIn('U_SHARED');

    expect(await repos.slackIdentityLink.findBySlackUserId('U_SHARED')).toBeNull();
  });
});

describe('an email that matches nobody', () => {
  it('creates no team member', async () => {
    /*
     * Property 1, and the promise Requirement 4 exists to keep: workspace
     * membership is not team membership. A contractor invited to a channel
     * must not be able to join a team by typing a slash command.
     */
    auth = build(directory({ U_STRANGER: 'stranger@example.invalid' }));

    await auth.requestSlackSignIn('U_STRANGER');

    expect(await repos.teamMember.findAllByEmail('stranger@example.invalid')).toEqual([]);
  });

  it('says only what an unlinked account is told', async () => {
    // Otherwise the command becomes a way of asking which addresses are on a
    // team, which is the enumeration the magic-link route refuses to allow
    auth = build(directory({ U_STRANGER: 'stranger@example.invalid' }));

    expect(await auth.requestSlackSignIn('U_STRANGER')).toEqual({ status: 'unlinked' });
  });
});

describe('when the email cannot be read at all', () => {
  it('falls back rather than failing', async () => {
    // Requirement 3.5. A guest account, a missing scope and an outage are the
    // same answer here: ask a delivery manager
    auth = build(directory({ U_GUEST: null }));

    expect(await auth.requestSlackSignIn('U_GUEST')).toEqual({ status: 'unlinked' });
  });

  it('falls back when no directory is configured at all', async () => {
    /*
     * The phase-2 deployment: a Slack app without the scope, or a build that
     * predates this. The manager-asserted path still works, and that is the
     * point of keeping the two separable.
     */
    expect(await auth.requestSlackSignIn('U_ANYBODY')).toEqual({ status: 'unlinked' });
  });

  it('still signs in somebody a manager linked by hand', async () => {
    // The fallback must not disable the path it is falling back to
    const { member } = await memberOnTeam('Manual Team', 'manual@example.invalid');
    await repos.slackIdentityLink.create({ memberId: member.id, slackUserId: 'U_MANUAL' });
    auth = build(directory({ U_MANUAL: null }));

    expect((await auth.requestSlackSignIn('U_MANUAL')).status).toBe('issued');
  });
});

describe('what the audit log says about an automatic link', () => {
  it('records it against the team, naming the member', async () => {
    const { team, member } = await memberOnTeam('Audit Team', 'alice@example.invalid');
    auth = build(directory({ U_ALICE: 'alice@example.invalid' }));

    await auth.requestSlackSignIn('U_ALICE');

    const entries = await repos.auditLog.findByTeamId(team.id);
    expect(entries[0]).toMatchObject({ changeType: 'slack_binding_matched' });
    expect(entries[0].newValue).toContain(member.id);
  });

  it('is distinguishable from one a manager asserted', async () => {
    /*
     * Requirement 3.6 and NFR 2.1. "Who linked this account" and "on what
     * basis" are different questions, and a single change type would answer
     * only the first.
     */
    const { team } = await memberOnTeam('Audit Team', 'alice@example.invalid');
    auth = build(directory({ U_ALICE: 'alice@example.invalid' }));

    await auth.requestSlackSignIn('U_ALICE');

    const entries = await repos.auditLog.findByTeamId(team.id);
    expect(entries[0].changeType).not.toBe('slack_binding_asserted');
  });

  it('carries no address, only ids', async () => {
    // The match is made on an address; the record of it is not the place for
    // one
    const { team } = await memberOnTeam('Audit Team', 'alice@example.invalid');
    auth = build(directory({ U_ALICE: 'alice@example.invalid' }));

    await auth.requestSlackSignIn('U_ALICE');

    const entries = await repos.auditLog.findByTeamId(team.id);
    expect(JSON.stringify(entries)).not.toContain('alice@example.invalid');
  });

  it('writes nothing when no link was made', async () => {
    const { team } = await memberOnTeam('Audit Team', 'alice@example.invalid');
    auth = build(directory({ U_STRANGER: 'stranger@example.invalid' }));

    await auth.requestSlackSignIn('U_STRANGER');

    expect(await repos.auditLog.findByTeamId(team.id)).toEqual([]);
  });
});
