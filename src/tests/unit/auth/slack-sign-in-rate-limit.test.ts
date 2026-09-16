/**
 * How often somebody may ask Slack to sign them in.
 *
 * Requirements: Slack Sign In 4.3; Original 7.9
 *
 * The magic-link route is limited because a sign-in request mints a credential
 * and sends it somewhere. This mints a credential and puts it in a Slack reply,
 * so the same reasoning applies — and the same numbers, because a second set
 * would be a second thing to keep in step.
 *
 * Keyed on the Slack user id, which the route takes from a payload whose
 * signature it has already verified. A limit keyed on anything a caller can
 * choose is not a limit.
 */

import { describe, expect, it, beforeEach } from 'vitest';

import { createInMemoryRepositories, type Repositories } from '@/lib/repositories';
import { createAuthService, type AuthService } from '@/lib/services/auth.service';
import { InMemoryEmailService } from '@/lib/services/email.service';
import { resetRateLimitStore } from '@/lib/rate-limit';

let repos: Repositories;
let auth: AuthService;

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
    emailService: new InMemoryEmailService(),
  });
});

async function linkedMember(slackUserId: string) {
  const team = await repos.team.create({ name: `Team ${slackUserId}` });
  const member = await repos.teamMember.create({
    teamId: team.id,
    name: 'Linked',
    email: `${slackUserId}@slack.test`,
  });
  await repos.slackIdentityLink.create({ memberId: member.id, slackUserId });
  return member;
}

describe('asking too often', () => {
  it('lets a reasonable number through', async () => {
    await linkedMember('U_STEADY');

    for (let i = 0; i < 5; i += 1) {
      expect((await auth.requestSlackSignIn('U_STEADY')).status).toBe('issued');
    }
  });

  it('refuses once the limit is reached', async () => {
    await linkedMember('U_EAGER');
    for (let i = 0; i < 5; i += 1) await auth.requestSlackSignIn('U_EAGER');

    expect((await auth.requestSlackSignIn('U_EAGER')).status).toBe('rate_limited');
  });

  it('mints nothing once it is refusing', async () => {
    /*
     * The status is the symptom; the guarantee is that no further credential
     * exists. A limit that refused in words while still writing a token would
     * be worse than none, because it would look enforced.
     */
    await linkedMember('U_MINT');
    const minted: string[] = [];
    const create = repos.magicLink.create.bind(repos.magicLink);
    repos.magicLink.create = async data => {
      minted.push(data.token);
      return create(data);
    };
    for (let i = 0; i < 5; i += 1) await auth.requestSlackSignIn('U_MINT');
    const before = minted.length;

    await auth.requestSlackSignIn('U_MINT');

    expect(minted.length).toBe(before);
  });

  it('says when to try again', async () => {
    // A refusal with no horizon is indistinguishable from a broken command
    await linkedMember('U_WHEN');
    for (let i = 0; i < 5; i += 1) await auth.requestSlackSignIn('U_WHEN');

    const result = await auth.requestSlackSignIn('U_WHEN');
    if (result.status !== 'rate_limited') throw new Error('expected a refusal');

    expect(result.retryAfterMs).toBeGreaterThan(0);
    expect(result.retryAfterMs).toBeLessThanOrEqual(60 * 60 * 1000);
  });

  it('limits one person without limiting anybody else', async () => {
    // Keyed per Slack user, so one eager colleague cannot lock out a team
    await linkedMember('U_NOISY');
    await linkedMember('U_QUIET');
    for (let i = 0; i < 6; i += 1) await auth.requestSlackSignIn('U_NOISY');

    expect((await auth.requestSlackSignIn('U_QUIET')).status).toBe('issued');
  });

  it('counts an unlinked account too, so the limit is not a way to probe', async () => {
    /*
     * If only linked accounts were counted, an attacker could hammer the
     * command and read team membership off which ids start being refused.
     * Counted before the identity lookup, so both look the same.
     */
    for (let i = 0; i < 5; i += 1) await auth.requestSlackSignIn('U_PROBE');

    expect((await auth.requestSlackSignIn('U_PROBE')).status).toBe('rate_limited');
  });
});
