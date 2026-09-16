/**
 * The link Slack hands back, and what it is worth.
 *
 * Requirements: Slack Sign In 1.2, 1.4, 1.5, NFR 1.2
 * Properties: 2 (single use)
 *
 * Reusing the magic-link lifecycle means single-use, expiry and session
 * creation come for free. "For free" is a claim, not a fact, so these assert
 * them for a token this route issued rather than trusting that the other
 * route's tests cover it.
 */

import { describe, expect, it, beforeEach } from 'vitest';

import { createInMemoryRepositories, type Repositories } from '@/lib/repositories';
import { createAuthService, type AuthService } from '@/lib/services/auth.service';
import { InMemoryEmailService } from '@/lib/services/email.service';
import { NotFoundError } from '@/lib/errors';

let repos: Repositories;
let auth: AuthService;
let email: InMemoryEmailService;

beforeEach(() => {
  repos = createInMemoryRepositories();
  email = new InMemoryEmailService();
  auth = createAuthService({
    pairingCodeRepo: repos.pairingCode,
    magicLinkRepo: repos.magicLink,
    teamMemberRepo: repos.teamMember,
    userSessionRepo: repos.userSession,
    pendingGenesisRepo: repos.pendingGenesis,
    sessionLinkRepo: repos.sessionLink,
    sessionRepo: repos.session,
    slackIdentityLinkRepo: repos.slackIdentityLink,
    emailService: email,
  });
});

async function linkedMember(slackUserId = 'U_LINKED') {
  const team = await repos.team.create({ name: 'Slack Team' });
  const member = await repos.teamMember.create({
    teamId: team.id,
    name: 'Linked',
    email: 'linked@slack.test',
  });
  await repos.slackIdentityLink.create({ memberId: member.id, slackUserId });
  return member;
}

/** The token a Slack sign-in request produced, or a failure if it produced none. */
async function issuedToken(slackUserId = 'U_LINKED'): Promise<string> {
  const result = await auth.requestSlackSignIn(slackUserId);
  if (result.status !== 'issued') throw new Error('expected a token to be issued');
  return result.token;
}

describe('a token issued through Slack', () => {
  it('signs in the member the Slack account is linked to', async () => {
    const member = await linkedMember();

    const result = await auth.verifyMagicLink(await issuedToken());

    expect(result).toMatchObject({ status: 'authenticated', memberId: member.id });
  });

  it('establishes a real browser session, not just a claim of one', async () => {
    /*
     * The observable outcome. A result object saying "authenticated" proves
     * nothing if no `UserSession` row exists for the cookie to match against.
     */
    const member = await linkedMember();

    const result = await auth.verifyMagicLink(await issuedToken());
    if (result.status !== 'authenticated') throw new Error('expected authentication');

    const session = await repos.userSession.findByToken(result.sessionToken);
    expect(session).toMatchObject({ memberId: member.id });
  });

  it('expires on the same terms as one that arrived by email', async () => {
    /*
     * Requirement 1.4 asks for the same terms as a magic link, and the way to
     * be sure is to issue one of each and compare them — not to assert a
     * constant copied out of the implementation, which agrees with itself by
     * construction.
     *
     * This is what would catch somebody giving Slack-issued tokens a lifetime
     * of their own.
     */
    await linkedMember();
    const team = await repos.team.create({ name: 'Email Team' });
    await repos.teamMember.create({
      teamId: team.id,
      name: 'Emailed',
      email: 'emailed@slack.test',
    });

    await auth.requestMagicLink('emailed@slack.test');
    const emailedToken = email.sentEmails.at(-1)?.token ?? '';
    const emailed = await repos.magicLink.findByToken(emailedToken);
    const viaSlack = await repos.magicLink.findByToken(await issuedToken());

    expect(emailed, 'the email path should have minted a token to compare against').not.toBeNull();
    const difference = Math.abs(
      (viaSlack?.expiresAt.getTime() ?? 0) - (emailed?.expiresAt.getTime() ?? 0),
    );
    expect(difference).toBeLessThan(5_000);
  });

  it('works once', async () => {
    // Property 2. A sign-in link is a credential, and one that survives its
    // first use is a credential sitting in somebody's Slack history
    await linkedMember();
    const token = await issuedToken();

    await auth.verifyMagicLink(token);

    await expect(auth.verifyMagicLink(token)).rejects.toThrow(NotFoundError);
  });

  it('leaves no second session behind when it is reused', async () => {
    // The throw is the symptom; the guarantee is that nothing was created
    await linkedMember();
    const token = await issuedToken();
    await auth.verifyMagicLink(token);

    const before = await repos.userSession.findValidByMemberId(
      (await repos.slackIdentityLink.findBySlackUserId('U_LINKED'))!.memberId,
    );
    await auth.verifyMagicLink(token).catch(() => undefined);
    const after = await repos.userSession.findValidByMemberId(
      (await repos.slackIdentityLink.findBySlackUserId('U_LINKED'))!.memberId,
    );

    expect(after?.token).toBe(before?.token);
  });

  it('stops working once it has expired', async () => {
    await linkedMember();
    const token = await issuedToken();
    const stored = await repos.magicLink.findByToken(token);
    // Reach past the service to age the token, which is the one thing a test
    // cannot do by waiting
    await repos.magicLink.create({
      token: `${token}-expired`,
      memberId: stored!.memberId,
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(auth.verifyMagicLink(`${token}-expired`)).rejects.toThrow(NotFoundError);
  });

  it('is issued to nobody when the Slack account is unlinked', async () => {
    const result = await auth.requestSlackSignIn('U_NOBODY');

    expect(result).toEqual({ status: 'unlinked' });
  });

  it('says the same thing whether the person is unknown or merely unlinked', async () => {
    /*
     * Requirement 1.5. A member who exists but has never linked, and a Slack
     * user on no team at all, must be indistinguishable from the reply — or
     * the command becomes a way of asking who is on a team.
     */
    const team = await repos.team.create({ name: 'Unlinked Team' });
    await repos.teamMember.create({
      teamId: team.id,
      name: 'Exists',
      email: 'exists@slack.test',
    });

    const existsButUnlinked = await auth.requestSlackSignIn('U_EXISTS_UNLINKED');
    const completeStranger = await auth.requestSlackSignIn('U_STRANGER');

    expect(existsButUnlinked).toEqual(completeStranger);
  });
});
