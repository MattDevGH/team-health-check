import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConflictError, NotFoundError } from '@/lib/errors';
import { createInMemoryRepositories, type Repositories } from '@/lib/repositories';
import { createTeamService, type TeamService } from '@/lib/services/team.service';

describe('TeamService member management', () => {
  let repos: Repositories;
  let service: TeamService;
  let teamId: string;

  beforeEach(async () => {
    repos = createInMemoryRepositories();
    service = createTeamService({
      teamRepo: repos.team,
      teamMemberRepo: repos.teamMember,
      teamMemberRoleRepo: repos.teamMemberRole,
      slackIdentityLinkRepo: repos.slackIdentityLink,
      auditLogRepo: repos.auditLog,
      sessionRepo: repos.session,
    });
    teamId = (await service.create('Member management', undefined, 'creator')).id;
  });

  it('serializes persisted roles and Slack links plus legacy defaults', async () => {
    const linked = await repos.teamMember.create({ teamId, name: 'Linked' });
    await repos.teamMemberRole.assign({ memberId: linked.id, teamId, role: 'team_member' });
    await repos.slackIdentityLink.create({ memberId: linked.id, slackUserId: 'U-LINKED' });
    const legacy = await repos.teamMember.create({ teamId, name: 'Legacy' });

    const members = await service.getMembers(teamId);

    expect(members.find(({ id }) => id === 'creator')).toMatchObject({
      roles: [{ role: 'delivery_manager' }],
      slackLink: null,
    });
    expect(members.find(({ id }) => id === linked.id)).toMatchObject({
      roles: [{ role: 'team_member' }],
      slackLink: { slackUserId: 'U-LINKED' },
    });
    expect(members.find(({ id }) => id === legacy.id)).toMatchObject({ roles: [], slackLink: null });
  });

  it('adds a member with exactly one team_member role and a renderable DTO', async () => {
    const member = await service.addMember(
      teamId,
      'New member',
      'new@example.com',
      'creator',
    );

    expect(member).toMatchObject({
      teamId,
      name: 'New member',
      email: 'new@example.com',
      roles: [{ role: 'team_member' }],
      slackLink: null,
    });
    expect(await repos.teamMemberRole.findByMemberAndTeam(member.id, teamId)).toHaveLength(1);
  });

  it('audits the exact returned member summary with the authenticated actor', async () => {
    const member = await service.addMember(
      teamId,
      'Audited member',
      undefined,
      'manager-1',
    );

    await expect(repos.auditLog.findByTeamId(teamId)).resolves.toContainEqual(
      expect.objectContaining({
        changeType: 'member_added',
        previousValue: '',
        newValue: JSON.stringify(member),
        userId: 'manager-1',
      }),
    );
  });

  it('leaves no member or role when the required audit append fails', async () => {
    vi.spyOn(repos.auditLog, 'create').mockRejectedValueOnce(
      new Error('audit unavailable'),
    );

    await expect(
      service.addMember(teamId, 'Atomic member', undefined, 'manager-1'),
    ).rejects.toThrow('audit unavailable');
    expect(await repos.teamMember.findByTeamId(teamId)).toHaveLength(1);
    expect(
      await repos.teamMemberRole.countByTeamAndRole(teamId, 'team_member'),
    ).toBe(0);
  });

  it('does not duplicate roles when an add retry conflicts', async () => {
    const member = await service.addMember(teamId, 'Retry member', 'retry@example.com', 'creator');

    await expect(service.addMember(teamId, 'Retry member', 'retry@example.com', 'creator')).rejects.toThrow(ConflictError);
    expect(await repos.teamMemberRole.findByMemberAndTeam(member.id, teamId)).toHaveLength(1);
  });

  it('replaces roles idempotently and promotes a legacy roleless member', async () => {
    const legacy = await repos.teamMember.create({ teamId, name: 'Legacy promotee' });

    const promoted = await service.updateMemberRole(teamId, legacy.id, 'delivery_manager', 'creator');
    const repeated = await service.updateMemberRole(teamId, legacy.id, 'delivery_manager', 'creator');

    expect(promoted.roles).toEqual([{ role: 'delivery_manager' }]);
    expect(repeated.roles).toEqual([{ role: 'delivery_manager' }]);
    expect(await repos.teamMemberRole.findByMemberAndTeam(legacy.id, teamId)).toHaveLength(1);
  });

  it('rejects changing the final delivery manager to team_member', async () => {
    await expect(service.updateMemberRole(teamId, 'creator', 'team_member', 'creator'))
      .rejects.toThrow(ConflictError);
  });

  it('rejects role changes for a target outside the team', async () => {
    const otherTeam = await repos.team.create({ name: 'Other' });
    const outsider = await repos.teamMember.create({ teamId: otherTeam.id, name: 'Outsider' });

    await expect(service.updateMemberRole(teamId, outsider.id, 'team_member', 'creator'))
      .rejects.toThrow(NotFoundError);
  });

  it('removes a non-final member and retains audit behavior', async () => {
    const member = await service.addMember(teamId, 'Remove me', undefined, 'creator');

    await service.removeMember(teamId, member.id, 'creator');

    expect(await repos.teamMember.findById(member.id)).toBeNull();
    expect((await repos.auditLog.findByTeamId(teamId)).some(({ changeType }) => changeType === 'member_removed')).toBe(true);
  });

  it('rejects removing the final delivery manager', async () => {
    await expect(service.removeMember(teamId, 'creator', 'creator')).rejects.toThrow(ConflictError);
    expect(await repos.teamMember.findById('creator')).not.toBeNull();
  });
});
