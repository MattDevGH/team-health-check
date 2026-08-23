import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { createInMemoryRepositories } from '@/lib/repositories';
import { createTeamService } from '@/lib/services/team.service';

const nameArb = fc.stringMatching(/^[A-Za-z][A-Za-z ]{0,30}[A-Za-z]$/);
const emailArb = fc.option(
  fc.tuple(fc.stringMatching(/^[a-z]{1,12}$/), fc.integer({ min: 1, max: 9999 }))
    .map(([name, suffix]) => `${name}${suffix}@example.com`),
  { nil: undefined },
);

describe('Property 24: member additions produce immutable audit entries', () => {
  it('records the exact returned summary with the authenticated actor', async () => {
    await fc.assert(
      fc.asyncProperty(nameArb, emailArb, fc.uuid(), async (name, email, actorId) => {
        const repos = createInMemoryRepositories();
        const service = createTeamService({
          teamRepo: repos.team,
          teamMemberRepo: repos.teamMember,
          teamMemberRoleRepo: repos.teamMemberRole,
          auditLogRepo: repos.auditLog,
          sessionRepo: repos.session,
        });
        const team = await repos.team.create({ name: 'Property Team' });

        const member = await service.addMember(team.id, name, email, actorId);

        const entries = await repos.auditLog.findByTeamId(team.id);
        expect(entries).toHaveLength(1);
        expect(entries[0]).toMatchObject({
          teamId: team.id,
          changeType: 'member_added',
          previousValue: '',
          newValue: JSON.stringify(member),
          userId: actorId,
        });
        expect(entries[0].timestamp).toBeInstanceOf(Date);
      }),
      { numRuns: 100 },
    );
  });
});
