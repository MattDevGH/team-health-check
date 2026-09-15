/**
 * Resolving what the navigation needs, on the server.
 *
 * Requirements: Feeling Responsive 1.1, 2.1, 2.3
 *
 * The shell used to fetch `/api/me` after hydration, which cost a round trip
 * and made the menu arrive in two pieces — some destinations, then the rest.
 * Resolving it in the layout instead means the HTML leaves the server with the
 * navigation already complete.
 *
 * A function of a token rather than of a request, because a Server Component
 * reads cookies through `cookies()` and has no NextRequest to hand.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { createInMemoryRepositories, type Repositories } from '@/lib/repositories';
import { resolveShellContext, type ShellContextDeps } from '@/lib/auth/shell-context';

const HOUR = 60 * 60 * 1000;

let repos: Repositories;
let deps: ShellContextDeps;
let memberId: string;
let teamId: string;

beforeEach(async () => {
  repos = createInMemoryRepositories();
  deps = {
    userSessionRepo: repos.userSession,
    teamMemberRepo: repos.teamMember,
    teamRepo: repos.team,
    teamMemberRoleRepo: repos.teamMemberRole,
  };

  const team = await repos.team.create({ name: 'Shell Team' });
  teamId = team.id;

  const member = await repos.teamMember.create({
    teamId,
    name: 'Shell Member',
    email: 'shell@example.invalid',
  });
  memberId = member.id;
});

async function signIn(token: string, expiresAt = new Date(Date.now() + HOUR)): Promise<void> {
  await repos.userSession.create({ memberId, token, expiresAt });
}

describe('resolveShellContext', () => {
  it('gives the shell the team it needs to build team-scoped links', async () => {
    await signIn('good-token');

    const context = await resolveShellContext(deps, 'good-token');

    expect(context).toMatchObject({ team: { id: teamId, name: 'Shell Team' } });
  });

  it('gives it the roles, so a Delivery Manager is offered the audit log', async () => {
    await signIn('good-token');
    await repos.teamMemberRole.assign({ memberId, teamId, role: 'delivery_manager' });

    const context = await resolveShellContext(deps, 'good-token');

    expect(context?.roles).toContain('delivery_manager');
  });

  it('reports no roles rather than guessing for a contributor', async () => {
    await signIn('good-token');

    const context = await resolveShellContext(deps, 'good-token');

    expect(context?.roles).toEqual([]);
  });

  it('resolves nobody without a token', async () => {
    expect(await resolveShellContext(deps, undefined)).toBeNull();
  });

  it('resolves nobody for a token it has never seen', async () => {
    await signIn('good-token');

    expect(await resolveShellContext(deps, 'some-other-token')).toBeNull();
  });

  it('resolves nobody for an expired session', async () => {
    /*
     * The one that matters most. A layout that renders a navigation bar for an
     * expired session shows a member an application they have been signed out
     * of, and every link in it leads to a 401.
     */
    await signIn('stale-token', new Date(Date.now() - HOUR));

    expect(await resolveShellContext(deps, 'stale-token')).toBeNull();
  });

  it('resolves nobody when the session points at a member who is gone', async () => {
    await repos.userSession.create({
      memberId: 'deleted-member',
      token: 'orphan-token',
      expiresAt: new Date(Date.now() + HOUR),
    });

    expect(await resolveShellContext(deps, 'orphan-token')).toBeNull();
  });

  it('resolves a member whose team cannot be read, with no team rather than no shell', async () => {
    /*
     * Mirrors `/api/me`, which sends a null team rather than an id it could not
     * resolve. The shell then offers the destinations that need no team id —
     * the health check and the profile — instead of links that 404.
     */
    await signIn('good-token');

    /*
     * A member whose team row cannot be read. Prisma's foreign key makes this
     * unreachable in production, which is why the deps are narrowed here
     * rather than the data corrupted: the branch still has to behave, because
     * `/api/me` has the same one and sends a null team.
     */
    const context = await resolveShellContext(
      { ...deps, teamRepo: { ...repos.team, findById: async () => null } },
      'good-token',
    );

    expect(context).toMatchObject({ team: null, roles: [] });
  });

  it('does not hand the shell anything it was not asked for', async () => {
    // The context crosses a server/client boundary and is serialised into the
    // page. Anything extra in it is published to whoever reads the HTML.
    await signIn('good-token');

    const context = await resolveShellContext(deps, 'good-token');

    expect(Object.keys(context ?? {}).sort()).toEqual(['roles', 'team']);
  });

  it('does not put the session token in what it returns', async () => {
    await signIn('good-token');

    const context = await resolveShellContext(deps, 'good-token');

    expect(JSON.stringify(context)).not.toContain('good-token');
  });
});
