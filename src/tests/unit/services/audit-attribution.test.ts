/**
 * Tests for audit log actor attribution.
 * Requirements: Dashboard Refinement 6.1, 6.2, 6.3, 6.4, 6.5
 *
 * TDD: Red phase.
 *
 * The audit log stores actor ids and must keep storing them — it is append-only
 * history, and a name captured at write time would go stale the moment someone
 * was renamed. Resolution happens on read.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { createInMemoryRepositories, type Repositories } from '@/lib/repositories';
import { createAuditService, type AuditService } from '@/lib/services/audit.service';

const TEAM_ID = 'team-1';

describe('audit log attribution', () => {
  let repos: Repositories;
  let auditLog: AuditService;
  let viewerId: string;
  let colleagueId: string;

  beforeEach(async () => {
    repos = createInMemoryRepositories();
    auditLog = createAuditService({
      auditLogRepo: repos.auditLog,
      teamMemberRepo: repos.teamMember,
    });

    viewerId = (await repos.teamMember.create({ teamId: TEAM_ID, name: 'Matt', email: 'm@e.test' }))
      .id;
    colleagueId = (
      await repos.teamMember.create({ teamId: TEAM_ID, name: 'Priya', email: 'p@e.test' })
    ).id;
  });

  async function log(userId: string) {
    await auditLog.log({
      teamId: TEAM_ID,
      changeType: 'schedule_change',
      previousValue: 'a',
      newValue: 'b',
      userId,
    });
  }

  it('marks the reader as the actor on their own changes', async () => {
    await log(viewerId);

    const { entries } = await auditLog.getLog(TEAM_ID, undefined, viewerId);

    expect(entries[0].actor).toMatchObject({ isViewer: true, name: 'Matt' });
  });

  it('names another current member of the team', async () => {
    await log(colleagueId);

    const { entries } = await auditLog.getLog(TEAM_ID, undefined, viewerId);

    expect(entries[0].actor).toMatchObject({ isViewer: false, name: 'Priya', isErased: false });
  });

  it('cannot name someone who is no longer a member', async () => {
    await log('a-member-who-has-since-been-removed');

    const { entries } = await auditLog.getLog(TEAM_ID, undefined, viewerId);

    expect(entries[0].actor).toMatchObject({ isViewer: false, name: null, isErased: false });
  });

  it('reports an erased account as erased, without resolving it', async () => {
    // The GDPR deletion path writes `deleted:<hash>` precisely so the actor
    // cannot be identified. Resolving it would defeat the erasure.
    await log('deleted:9f8a7b6c');

    const { entries } = await auditLog.getLog(TEAM_ID, undefined, viewerId);

    expect(entries[0].actor).toMatchObject({ isErased: true, name: null, isViewer: false });
  });

  it('leaves the stored value untouched, whatever it resolves to', async () => {
    await log(colleagueId);

    const { entries } = await auditLog.getLog(TEAM_ID, undefined, viewerId);

    // Append-only: presentation may change, history may not
    expect(entries[0].userId).toBe(colleagueId);
  });

  it('resolves without a viewer, for callers that have no reader', async () => {
    await log(colleagueId);

    const { entries } = await auditLog.getLog(TEAM_ID);

    expect(entries[0].actor).toMatchObject({ isViewer: false, name: 'Priya' });
  });

  it('reads members once, not once per entry', async () => {
    // Twenty entries by the same two people must not become twenty lookups
    for (let i = 0; i < 20; i++) await log(i % 2 === 0 ? viewerId : colleagueId);

    let calls = 0;
    const counting = {
      ...repos.teamMember,
      findByTeamId: async (teamId: string) => {
        calls += 1;
        return repos.teamMember.findByTeamId(teamId);
      },
    };
    const service = createAuditService({
      auditLogRepo: repos.auditLog,
      teamMemberRepo: counting as typeof repos.teamMember,
    });

    await service.getLog(TEAM_ID, undefined, viewerId);

    expect(calls).toBe(1);
  });
});
