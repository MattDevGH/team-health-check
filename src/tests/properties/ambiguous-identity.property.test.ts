/**
 * Property Tests for the ambiguous-identity guard.
 *
 * Feature: manager-experience
 * - Property 4: no token of either kind is created for an ambiguous email
 * - Property 5: addMember rejects an email held by another team, changing nothing
 * - Property 6: requestMagicLink returns without throwing for every input
 *
 * **Validates: Requirements 5.1, 5.2, 5.4, 5.6**
 *
 * A person belongs to exactly one team. The schema does not enforce that —
 * `TeamMember` is unique on `(teamId, name, email)`, proven against a real
 * database in `src/tests/integration/shared-email.test.ts` — so sign-in must
 * refuse to guess when an email matches more than one member.
 */

import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';

import { createInMemoryRepositories, type Repositories } from '@/lib/repositories';
import { createAuthService } from '@/lib/services/auth.service';
import { createTeamService } from '@/lib/services/team.service';
import { InMemoryEmailService } from '@/lib/services/email.service';
import { ConflictError } from '@/lib/errors';

const emailArb = fc.stringMatching(/^[a-z]{3,10}@example\.(com|org)$/);
const nameArb = fc.stringMatching(/^[A-Z][a-z]{2,10}$/);

function services(repos: Repositories) {
  return {
    auth: createAuthService({
      magicLinkRepo: repos.magicLink,
      teamMemberRepo: repos.teamMember,
      userSessionRepo: repos.userSession,
      pendingGenesisRepo: repos.pendingGenesis,
      pairingCodeRepo: repos.pairingCode,
      emailService: new InMemoryEmailService(),
    }),
    team: createTeamService({
      teamRepo: repos.team,
      teamMemberRepo: repos.teamMember,
      teamMemberRoleRepo: repos.teamMemberRole,
      auditLogRepo: repos.auditLog,
      sessionRepo: repos.session,
    }),
  };
}

describe('Property 4: an ambiguous email gets no token of any kind', () => {
  it('creates neither a magic link nor a pending genesis record, and sends nothing', async () => {
    await fc.assert(
      fc.asyncProperty(emailArb, nameArb, nameArb, async (email, nameA, nameB) => {
        const repos = createInMemoryRepositories();
        const emailService = new InMemoryEmailService();
        const auth = createAuthService({
          magicLinkRepo: repos.magicLink,
          teamMemberRepo: repos.teamMember,
          userSessionRepo: repos.userSession,
          pendingGenesisRepo: repos.pendingGenesis,
          pairingCodeRepo: repos.pairingCode,
          emailService,
        });

        const magicLinkCreate = vi.spyOn(repos.magicLink, 'create');
        const genesisCreate = vi.spyOn(repos.pendingGenesis, 'create');

        // The same address in two teams — the state the database permits
        await repos.teamMember.create({ teamId: 'team-a', name: nameA, email });
        await repos.teamMember.create({ teamId: 'team-b', name: nameB, email });

        await auth.requestMagicLink(email);

        // What the person experiences: no link arrives
        expect(emailService.sentEmails).toEqual([]);

        // And nothing was persisted that could later be redeemed. A magic link
        // would sign them into an arbitrary team; a genesis record would offer
        // to create a third.
        expect(magicLinkCreate).not.toHaveBeenCalled();
        expect(genesisCreate).not.toHaveBeenCalled();

        vi.restoreAllMocks();
      }),
      { numRuns: 40 },
    );
  });

  it('still issues a link when exactly one member holds the email', async () => {
    // Without this, a guard that refused every request would pass the property
    // above
    await fc.assert(
      fc.asyncProperty(emailArb, nameArb, async (email, name) => {
        const repos = createInMemoryRepositories();
        const emailService = new InMemoryEmailService();
        const auth = createAuthService({
          magicLinkRepo: repos.magicLink,
          teamMemberRepo: repos.teamMember,
          userSessionRepo: repos.userSession,
          pendingGenesisRepo: repos.pendingGenesis,
          pairingCodeRepo: repos.pairingCode,
          emailService,
        });

        await repos.teamMember.create({ teamId: 'team-a', name, email });
        await auth.requestMagicLink(email);

        expect(emailService.sentEmails).toHaveLength(1);
        const sent = emailService.sentEmails[0];
        expect(sent.to).toBe(email);
        // The token really is redeemable, not just a string that was emailed
        expect(await repos.magicLink.findByToken(sent.token)).not.toBeNull();
      }),
      { numRuns: 40 },
    );
  });
});

describe('Property 5: adding an email held by another team changes nothing', () => {
  it('throws, and leaves the member list and audit log as they were', async () => {
    await fc.assert(
      fc.asyncProperty(emailArb, nameArb, nameArb, async (email, existingName, newName) => {
        const repos = createInMemoryRepositories();
        const { team } = services(repos);

        const other = await repos.team.create({ name: 'Other Team' });
        const target = await repos.team.create({ name: 'Target Team' });
        await repos.teamMember.create({ teamId: other.id, name: existingName, email });

        const before = {
          members: (await repos.teamMember.findByTeamId(target.id)).length,
          audits: (await repos.auditLog.findByTeamId(target.id)).length,
        };

        await expect(team.addMember(target.id, newName, email, 'actor-1')).rejects.toBeInstanceOf(
          ConflictError,
        );

        // The rejection has to happen before anything is written, or a refused
        // addition still leaves a trace
        expect(await repos.teamMember.findByTeamId(target.id)).toHaveLength(before.members);
        expect(await repos.auditLog.findByTeamId(target.id)).toHaveLength(before.audits);
      }),
      { numRuns: 40 },
    );
  });

  it('still accepts an email no other team holds', async () => {
    await fc.assert(
      fc.asyncProperty(emailArb, nameArb, async (email, name) => {
        const repos = createInMemoryRepositories();
        const { team } = services(repos);
        const target = await repos.team.create({ name: 'Target Team' });

        await expect(team.addMember(target.id, name, email, 'actor-1')).resolves.toBeDefined();
      }),
      { numRuns: 40 },
    );
  });
});

describe('Property 6: requesting a magic link never throws', () => {
  it('returns normally whether the email is unknown, unique or ambiguous', async () => {
    await fc.assert(
      fc.asyncProperty(
        emailArb,
        fc.integer({ min: 0, max: 3 }),
        async (email, memberCount) => {
          const repos = createInMemoryRepositories();
          const { auth } = services(repos);

          for (let i = 0; i < memberCount; i++) {
            await repos.teamMember.create({ teamId: `team-${i}`, name: `Member ${i}`, email });
          }

          // Anti-enumeration is a claim about *every* input: an ambiguous email
          // that threw would be distinguishable from one that did not
          await expect(auth.requestMagicLink(email)).resolves.toBeUndefined();
        },
      ),
      { numRuns: 40 },
    );
  });
});
