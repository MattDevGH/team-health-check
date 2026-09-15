/**
 * Assembling a member's profile without queueing work that could overlap.
 *
 * Requirements: Feeling Responsive 3.1, 3.3
 * Properties: 2 (a budget is never met by losing data), 3 (only reads overlap)
 *
 * `/api/me` issued five queries one after another, each waiting for the one
 * before it. Two of them — the Slack link and the team — depend only on the
 * member, not on each other, so one of them was waiting for no reason.
 *
 * **Concurrency is asserted by ordering, not by timing.** A test that measures
 * elapsed time would pass or fail with the machine it runs on. These hold the
 * first query open and assert the second has already started: if the code
 * awaits them in sequence, the second call never happens and the test fails on
 * a fact rather than on a stopwatch.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createInMemoryRepositories, type Repositories } from '@/lib/repositories';
import { resolveMemberProfile, type MemberProfileDeps } from '@/lib/services/member-profile.service';

let repos: Repositories;
let deps: MemberProfileDeps;
let memberId: string;
let teamId: string;

beforeEach(async () => {
  repos = createInMemoryRepositories();
  deps = {
    teamMemberRepo: repos.teamMember,
    slackIdentityLinkRepo: repos.slackIdentityLink,
    teamRepo: repos.team,
    teamMemberRoleRepo: repos.teamMemberRole,
  };

  const team = await repos.team.create({ name: 'Profile Team' });
  teamId = team.id;

  const member = await repos.teamMember.create({
    teamId,
    name: 'Profile Member',
    email: 'profile@example.invalid',
  });
  memberId = member.id;
});

describe('resolveMemberProfile', () => {
  it('returns the member, their team, their roles and their Slack link', async () => {
    await repos.teamMemberRole.assign({ memberId, teamId, role: 'delivery_manager' });

    const profile = await resolveMemberProfile(deps, memberId);

    expect(profile).toMatchObject({
      id: memberId,
      team: { id: teamId, name: 'Profile Team' },
      roles: ['delivery_manager'],
      slackLink: null,
    });
  });

  it('carries the privacy mode with the team, which is where it belongs', async () => {
    // The profile page needs it to tell a member whether their individual
    // answers can be attributed to them
    const profile = await resolveMemberProfile(deps, memberId);

    expect(profile?.team?.privacyMode).toBeDefined();
  });

  it('reports a linked Slack account by its user id', async () => {
    await repos.slackIdentityLink.upsertByMemberId(memberId, 'U123');

    const profile = await resolveMemberProfile(deps, memberId);

    expect(profile?.slackLink).toEqual({ slackUserId: 'U123' });
  });

  it('reports an unknown member as unknown rather than as an empty profile', async () => {
    expect(await resolveMemberProfile(deps, 'nobody')).toBeNull();
  });

  it('sends no team rather than an id it could not resolve', async () => {
    const profile = await resolveMemberProfile(
      { ...deps, teamRepo: { ...repos.team, findById: async () => null } },
      memberId,
    );

    expect(profile).toMatchObject({ team: null, roles: [] });
  });
});

describe('what resolveMemberProfile waits for', () => {
  /** A promise this test decides when to settle. */
  function deferred<T>() {
    let release: (value: T) => void = () => {};
    const promise = new Promise<T>(resolve => {
      release = resolve;
    });
    return { promise, release };
  }

  it('does not make the Slack link wait for the team', async () => {
    /*
     * The saving this task exists for. Held open, the team lookup must not stop
     * the Slack lookup from starting — if it does, the two round trips add up
     * instead of overlapping.
     */
    const heldTeam = deferred<null>();
    const slackAsked = vi.fn();

    const pending = resolveMemberProfile(
      {
        ...deps,
        teamRepo: { ...repos.team, findById: () => heldTeam.promise },
        slackIdentityLinkRepo: {
          ...repos.slackIdentityLink,
          findByMemberId: async (id: string) => {
            slackAsked();
            return repos.slackIdentityLink.findByMemberId(id);
          },
        },
      },
      memberId,
    );

    // Let anything already started run, without settling the team lookup
    await Promise.resolve();
    await Promise.resolve();

    expect(slackAsked, 'the Slack link waited for the team').toHaveBeenCalled();

    heldTeam.release(null);
    await pending;
  });

  it('does not make the team wait for the Slack link', async () => {
    // The same property from the other side: neither is privileged
    const heldSlack = deferred<null>();
    const teamAsked = vi.fn();

    const pending = resolveMemberProfile(
      {
        ...deps,
        slackIdentityLinkRepo: { ...repos.slackIdentityLink, findByMemberId: () => heldSlack.promise },
        teamRepo: {
          ...repos.team,
          findById: async (id: string) => {
            teamAsked();
            return repos.team.findById(id);
          },
        },
      },
      memberId,
    );

    await Promise.resolve();
    await Promise.resolve();

    expect(teamAsked, 'the team waited for the Slack link').toHaveBeenCalled();

    heldSlack.release(null);
    await pending;
  });

  it('does not make the roles wait for the team either', async () => {
    /*
     * Written first as the limit of the change, on the reasoning that roles are
     * looked up by member *and team* and so must follow the team. A surviving
     * mutation proved that wrong: they are looked up by team **id**, which the
     * member row already carries. The team lookup supplies a name and a privacy
     * mode the roles query has no use for.
     */
    const heldTeam = deferred<null>();
    const rolesAsked = vi.fn();

    const pending = resolveMemberProfile(
      {
        ...deps,
        teamRepo: { ...repos.team, findById: () => heldTeam.promise },
        teamMemberRoleRepo: {
          ...repos.teamMemberRole,
          findByMemberAndTeam: async (m: string, t: string) => {
            rolesAsked();
            return repos.teamMemberRole.findByMemberAndTeam(m, t);
          },
        },
      },
      memberId,
    );

    await Promise.resolve();
    await Promise.resolve();

    expect(rolesAsked, 'the roles waited for the team').toHaveBeenCalled();

    heldTeam.release(null);
    await pending;
  });

  it('asks for the roles on the team the member belongs to', async () => {
    // The id comes from the member rather than the team row, so it has to be
    // the same id — a faster wrong answer would be worse than a slow one
    const asked: Array<[string, string]> = [];

    await resolveMemberProfile(
      {
        ...deps,
        teamMemberRoleRepo: {
          ...repos.teamMemberRole,
          findByMemberAndTeam: async (m: string, t: string) => {
            asked.push([m, t]);
            return repos.teamMemberRole.findByMemberAndTeam(m, t);
          },
        },
      },
      memberId,
    );

    expect(asked).toEqual([[memberId, teamId]]);
  });

  it('asks for nothing else once the member turns out not to exist', async () => {
    // Fanning out before the member is known would query on behalf of nobody
    const slackAsked = vi.fn();

    await resolveMemberProfile(
      {
        ...deps,
        slackIdentityLinkRepo: {
          ...repos.slackIdentityLink,
          findByMemberId: async (id: string) => {
            slackAsked();
            return repos.slackIdentityLink.findByMemberId(id);
          },
        },
      },
      'nobody',
    );

    expect(slackAsked).not.toHaveBeenCalled();
  });
});
