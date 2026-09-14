/**
 * Resolving the signed-in member's own health check.
 *
 * Requirements: Reaching Your Health Check 1.6, 2.1, 2.3
 * Properties: 1, 2
 *
 * On 2026-09-14 production opened a check on schedule, generated a session link,
 * and nobody could reach it. `/session/[token]` works; nothing in the
 * authenticated interface points at it, and the end-to-end suite only gets there
 * by reading the token out of the database.
 *
 * The service takes a member id and never a token or a target member, so there
 * is no parameter in which to ask for somebody else's link. That matters more
 * than it looks: a session link authenticates whoever holds it, which is exactly
 * why surfacing links for a manager to distribute was rejected in the Slack
 * sign-in spec.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { createInMemoryRepositories, type Repositories } from '@/lib/repositories';
import { createMyHealthCheckService } from '@/lib/services/my-health-check.service';

const TEAM = 'team-1';

describe('MyHealthCheckService.resolve', () => {
  let repos: Repositories;
  let service: ReturnType<typeof createMyHealthCheckService>;
  let alice: string;
  let bob: string;

  beforeEach(async () => {
    repos = createInMemoryRepositories();
    service = createMyHealthCheckService({
      sessionRepo: repos.session,
      sessionLinkRepo: repos.sessionLink,
      teamMemberRepo: repos.teamMember,
    });

    alice = (await repos.teamMember.create({ teamId: TEAM, name: 'Alice', email: 'a@e.test' })).id;
    bob = (await repos.teamMember.create({ teamId: TEAM, name: 'Bob', email: 'b@e.test' })).id;
  });

  async function openSessionWithLinks() {
    const session = await repos.session.create({ teamId: TEAM, status: 'open' });
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await repos.sessionLink.create({ token: 'alice-token', memberId: alice, sessionId: session.id, expiresAt });
    await repos.sessionLink.create({ token: 'bob-token', memberId: bob, sessionId: session.id, expiresAt });
    return session;
  }

  it('returns the member’s own link for the collecting check', async () => {
    await openSessionWithLinks();

    const result = await service.resolve(alice);

    expect(result).toMatchObject({ kind: 'open', token: 'alice-token' });
  });

  it('returns a different member their own link, not the first one it finds', async () => {
    // The property that makes this safe to expose at all
    await openSessionWithLinks();

    expect(await service.resolve(bob)).toMatchObject({ kind: 'open', token: 'bob-token' });
  });

  it('says nothing is open when no check is collecting', async () => {
    const result = await service.resolve(alice);

    expect(result.kind).toBe('none_open');
  });

  it('does not offer a closed check, since answers are no longer accepted', async () => {
    const session = await repos.session.create({ teamId: TEAM, status: 'closed' });
    await repos.sessionLink.create({
      token: 'stale-token', memberId: alice, sessionId: session.id,
      expiresAt: new Date(Date.now() + 60_000),
    });

    expect((await service.resolve(alice)).kind).toBe('none_open');
  });

  it('says so when the member has no link, rather than falling back to another’s', async () => {
    /*
     * The failure that would matter. A member added after the check opened has
     * no link for it, and handing them somebody else's would let them answer as
     * that person — silently, and in anonymous mode untraceably.
     */
    const session = await repos.session.create({ teamId: TEAM, status: 'open' });
    await repos.sessionLink.create({
      token: 'bob-token', memberId: bob, sessionId: session.id,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const result = await service.resolve(alice);

    expect(result.kind).toBe('no_link');
    expect(JSON.stringify(result)).not.toContain('bob-token');
  });

  it('reports nothing open for a member of a team that has no sessions', async () => {
    const other = await repos.teamMember.create({
      teamId: 'team-2', name: 'Carol', email: 'c@e.test',
    });
    await openSessionWithLinks();

    // team-1 has an open check; team-2 does not, and Carol must not see it
    expect((await service.resolve(other.id)).kind).toBe('none_open');
  });

  it('reports an unknown member as unknown rather than guessing a team', async () => {
    await openSessionWithLinks();

    expect((await service.resolve('nobody')).kind).toBe('no_member');
  });
});
