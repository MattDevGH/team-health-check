/**
 * No notification preference can stop a member signing in.
 *
 * Requirements: Reaching Your Health Check 4.2, 4.4
 * Properties: 5
 *
 * The access link arrives by email. A member who reads "email prompts" as
 * "stop emailing me", turns it off, and is right would have locked themselves
 * out of the application — not been mildly inconvenienced.
 *
 * Today nothing on the magic-link path reads a preference at all, so this is
 * green the moment it is written. That is the point: Property 5 is an
 * invariant about a path that has every reason to grow a check later, and the
 * cheapest moment to write the test that refuses one is before somebody adds
 * it. The requirement is stated in the profile control's own wording, so the
 * two would otherwise disagree in silence.
 *
 * Generated over every combination rather than the obvious one, because a
 * check added later would most likely read both fields together.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import fc from 'fast-check';

import { createInMemoryRepositories, type Repositories } from '@/lib/repositories';
import { createAuthService, type AuthService } from '@/lib/services/auth.service';
import { InMemoryEmailService } from '@/lib/services/email.service';

let repos: Repositories;
let email: InMemoryEmailService;
let auth: AuthService;
let teamId = '';

beforeEach(async () => {
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
    auditLogRepo: repos.auditLog,
    emailService: email,
  });

  const team = await repos.team.create({ name: 'Sign In Team' });
  teamId = team.id;
});

/** A member holding exactly this combination of preferences. */
async function memberWith(preferences: {
  emailPromptsEnabled: boolean | null;
  remindersEnabled: boolean;
}): Promise<string> {
  const address = `member-${Math.random().toString(36).slice(2)}@signin.test`;
  const member = await repos.teamMember.create({ teamId, name: 'Member', email: address });
  await repos.teamMember.update(member.id, preferences);
  return address;
}

describe('a member who turned email prompts off', () => {
  it('still receives a magic link', async () => {
    // Requirement 4.2. The control says so; this is what makes the control
    // honest
    const address = await memberWith({ emailPromptsEnabled: false, remindersEnabled: true });

    await auth.requestMagicLink(address);

    expect(email.sentEmails).toHaveLength(1);
    expect(email.sentEmails[0]).toMatchObject({ to: address });
  });

  it('receives it even with every other notification turned off too', async () => {
    const address = await memberWith({ emailPromptsEnabled: false, remindersEnabled: false });

    await auth.requestMagicLink(address);

    expect(email.sentEmails).toHaveLength(1);
  });

  it('receives a sign-in email and not a prompt', async () => {
    /*
     * The fake keeps the two in separate lists precisely so this can be
     * asserted. One list would let this pass on the wrong message — which is
     * the shape of the reminder defect this project has already shipped once.
     */
    const address = await memberWith({ emailPromptsEnabled: false, remindersEnabled: true });

    await auth.requestMagicLink(address);

    expect(email.sentPrompts).toEqual([]);
  });
});

describe('over every combination of preferences', () => {
  it('always sends the magic link', async () => {
    // Property 5
    await fc.assert(
      fc.asyncProperty(
        fc.option(fc.boolean(), { nil: null }),
        fc.boolean(),
        async (emailPromptsEnabled, remindersEnabled) => {
          const address = await memberWith({ emailPromptsEnabled, remindersEnabled });
          const before = email.sentEmails.length;

          await auth.requestMagicLink(address);

          expect(email.sentEmails.length, 'a preference prevented a sign-in email').toBe(
            before + 1,
          );
        },
      ),
      { numRuns: 20 },
    );
  });
});
