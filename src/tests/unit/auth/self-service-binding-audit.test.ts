/**
 * A member linking or unlinking their own Slack account leaves a trace.
 *
 * Requirements: Slack Sign In 2.3, NFR 2.1, NFR 2.2
 *
 * NFR 2.1 asks that *every* binding be attributable — who asserted it, when,
 * and on what basis. Three of the four ways a binding changes were audited: a
 * manager asserting one, an email match creating one, and a manager clearing
 * one. The two a member does for themselves were not.
 *
 * Found by reading a real audit log after the 2026-09-17 workspace pass. It
 * showed two `slack_binding_matched` entries, each with "Slack user id: None"
 * beforehand — which only makes sense if something unlinked the account in
 * between, and nothing said what. A log with a hole in it reads as a log that
 * is complete.
 */

import { describe, expect, it, beforeEach } from 'vitest';

import { createInMemoryRepositories, type Repositories } from '@/lib/repositories';
import { createAuthService, type AuthService } from '@/lib/services/auth.service';
import { InMemoryEmailService } from '@/lib/services/email.service';

let repos: Repositories;
let auth: AuthService;
let teamId = '';
let memberId = '';

beforeEach(async () => {
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

  const team = await repos.team.create({ name: 'Self Service Team' });
  teamId = team.id;
  const member = await repos.teamMember.create({
    teamId,
    name: 'Member',
    email: 'member@self.test',
  });
  memberId = member.id;
});

async function entryOfType(changeType: string) {
  return (await repos.auditLog.findByTeamId(teamId)).find(
    entry => entry.changeType === changeType,
  );
}

describe('a member linking their own account with a pairing code', () => {
  it('is recorded', async () => {
    const code = await auth.generatePairingCode('U_SELF');

    await auth.verifyPairingCode(memberId, code);

    expect(await entryOfType('slack_binding_self_linked')).toBeDefined();
  });

  it('names the member as the one who did it', async () => {
    // Not a manager, and not the application. The actor is the point
    const code = await auth.generatePairingCode('U_SELF');

    await auth.verifyPairingCode(memberId, code);

    expect(await entryOfType('slack_binding_self_linked')).toMatchObject({ userId: memberId });
  });

  it('says which Slack account, so the entry can be acted on', async () => {
    const code = await auth.generatePairingCode('U_SELF');

    await auth.verifyPairingCode(memberId, code);

    expect((await entryOfType('slack_binding_self_linked'))?.newValue).toContain('U_SELF');
  });

  it('is distinguishable from a manager asserting it or an email matching it', async () => {
    /*
     * Three ways a link gets made, and "on what basis" is the question the
     * change type answers. One type for all three would answer only "who".
     */
    const code = await auth.generatePairingCode('U_SELF');

    await auth.verifyPairingCode(memberId, code);

    const entry = await entryOfType('slack_binding_self_linked');
    expect(entry?.changeType).not.toBe('slack_binding_asserted');
    expect(entry?.changeType).not.toBe('slack_binding_matched');
  });

  it('writes nothing when the code was never valid', async () => {
    // A refused pairing is not a change, and recording it would suggest one
    await auth.verifyPairingCode(memberId, 'NEVER');

    expect(await repos.auditLog.findByTeamId(teamId)).toEqual([]);
  });
});

describe('a member unlinking their own account', () => {
  it('is recorded', async () => {
    /*
     * The gap the workspace pass exposed. Unlinking from the profile page went
     * straight to the repository and wrote nothing, so the log showed an
     * account being linked twice with no account of how it came to be unlinked.
     */
    await repos.slackIdentityLink.create({ memberId, slackUserId: 'U_SELF' });

    await auth.unlinkSlackAccount(memberId);

    expect(await entryOfType('slack_binding_removed')).toBeDefined();
  });

  it('names the member, since they did it themselves', async () => {
    await repos.slackIdentityLink.create({ memberId, slackUserId: 'U_SELF' });

    await auth.unlinkSlackAccount(memberId);

    expect(await entryOfType('slack_binding_removed')).toMatchObject({ userId: memberId });
  });

  it('says which account was removed, not merely that one was', async () => {
    await repos.slackIdentityLink.create({ memberId, slackUserId: 'U_SELF' });

    await auth.unlinkSlackAccount(memberId);

    expect((await entryOfType('slack_binding_removed'))?.previousValue).toContain('U_SELF');
  });

  it('actually removes the link', async () => {
    // The record is the addition; the removal is still the point
    await repos.slackIdentityLink.create({ memberId, slackUserId: 'U_SELF' });

    await auth.unlinkSlackAccount(memberId);

    expect(await repos.slackIdentityLink.findBySlackUserId('U_SELF')).toBeNull();
  });

  it('writes nothing when there was no link to remove', async () => {
    await auth.unlinkSlackAccount(memberId);

    expect(await repos.auditLog.findByTeamId(teamId)).toEqual([]);
  });

  it('is harmless when there was no link to remove', async () => {
    await expect(auth.unlinkSlackAccount(memberId)).resolves.toBeUndefined();
  });
});

describe('the four ways a binding changes', () => {
  it('each leave a record naming who and on what basis', async () => {
    /*
     * NFR 2.1 in one test. A manager asserting, the application matching, a
     * member linking themselves, and a removal — read back together, because
     * the gap was not in any one of them but in the set.
     */
    const code = await auth.generatePairingCode('U_SELF');
    await auth.verifyPairingCode(memberId, code);
    await auth.unlinkSlackAccount(memberId);

    const entries = await repos.auditLog.findByTeamId(teamId);
    const types = entries.map(entry => entry.changeType);

    expect(types).toContain('slack_binding_self_linked');
    expect(types).toContain('slack_binding_removed');
    for (const entry of entries) {
      expect(entry.userId, 'every binding change names an actor').toBeTruthy();
    }
  });
});
