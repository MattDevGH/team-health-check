/**
 * Tests for GET /api/me/health-check
 *
 * Requirements: Reaching Your Health Check 1.3, 1.5, 2.1
 *
 * Written during the task reconciliation on 2026-09-15, which found two boxes
 * that could not honestly be ticked: nothing proved the route answers a
 * contributor, and nothing proved it refuses an unauthenticated caller. The
 * file even exports a `_testRepos` seam "so route tests can seed data" — a seam
 * built for tests that were never written.
 *
 * The behaviour was right. The evidence was missing, which is a different
 * problem and not a smaller one: the service beneath this is well covered, and
 * a route can still hand the wrong member's link to the wrong person.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

import { GET, _testRepos as repos } from './route';

/**
 * A team of its own per test.
 *
 * The route builds its service from a module-level container, so the
 * in-memory repositories live for the whole file. A shared team id let a
 * session opened by one test decide the answer given to the next — the first
 * run of this file reported `no_link` for a member who had no check open at
 * all.
 */
let team: string;

function request(sessionToken?: string): NextRequest {
  const headers = new Headers();
  if (sessionToken) headers.set('cookie', `session=${sessionToken}`);
  return new NextRequest('http://localhost/api/me/health-check', { method: 'GET', headers });
}

async function signIn(memberId: string, token: string): Promise<void> {
  await repos.userSession.create({
    memberId,
    token,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });
}

let contributorId: string;

beforeEach(async () => {
  team = `team-${Math.random().toString(36).slice(2)}`;

  const contributor = await repos.teamMember.create({
    teamId: team,
    name: 'Contributor',
    email: `contributor-${Date.now()}@example.invalid`,
  });
  contributorId = contributor.id;
});

describe('GET /api/me/health-check', () => {
  it('refuses a caller it cannot identify', async () => {
    const response = await GET(request(), { params: Promise.resolve({}) });

    expect(response.status).toBe(401);
  });

  it('tells an unauthenticated caller nothing about whether a check is open', async () => {
    /*
     * A 401 that varied — 404 when nothing is open, 401 otherwise — would let
     * anyone with the URL learn a team's rhythm without being in it.
     */
    const session = await repos.session.create({ teamId: team, status: 'open' });
    await repos.sessionLink.create({
      token: 'contributor-link',
      memberId: contributorId,
      sessionId: session.id,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const response = await GET(request(), { params: Promise.resolve({}) });
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(401);
    expect(JSON.stringify(body)).not.toContain('contributor-link');
    expect(JSON.stringify(body)).not.toContain('open');
  });

  it('answers a contributor, not only a Delivery Manager', async () => {
    /*
     * The journey this route exists for. A contributor never opens the
     * dashboard — they arrive from a prompt, answer, and leave — so a role gate
     * here would refuse exactly the person it was built for.
     *
     * The member is seeded with no role at all, which is what a contributor is.
     */
    const session = await repos.session.create({ teamId: team, status: 'open' });
    await repos.sessionLink.create({
      token: 'contributor-link',
      memberId: contributorId,
      sessionId: session.id,
      expiresAt: new Date(Date.now() + 60_000),
    });
    await signIn(contributorId, 'contributor-session');

    const response = await GET(request('contributor-session'), { params: Promise.resolve({}) });
    const body = (await response.json()) as { kind?: string; token?: string };

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ kind: 'open', token: 'contributor-link' });
  });

  it('answers with a state rather than an error when nothing is open', async () => {
    // A 404 would make the caller guess whether the route was missing, the
    // member was unknown, or there was simply nothing to answer today
    await signIn(contributorId, 'quiet-session');

    const response = await GET(request('quiet-session'), { params: Promise.resolve({}) });
    const body = (await response.json()) as { kind?: string };

    expect(response.status).toBe(200);
    expect(body.kind).toBe('none_open');
  });

  it('gives a member their own link and never another member’s', async () => {
    /*
     * The failure that would matter most, asserted through the route rather
     * than the service: the service takes a member id and the route supplies it
     * from the session cookie, so a mistake here hands one member another's
     * link — and in anonymous mode, untraceably.
     */
    const other = await repos.teamMember.create({
      teamId: team,
      name: 'Other',
      email: `other-${Date.now()}@example.invalid`,
    });
    const session = await repos.session.create({ teamId: team, status: 'open' });

    for (const [memberId, token] of [
      [contributorId, 'mine'],
      [other.id, 'theirs'],
    ]) {
      await repos.sessionLink.create({
        token,
        memberId,
        sessionId: session.id,
        expiresAt: new Date(Date.now() + 60_000),
      });
    }

    await signIn(contributorId, 'my-session');

    const body = (await (
      await GET(request('my-session'), { params: Promise.resolve({}) })
    ).json()) as { token?: string };

    expect(body.token).toBe('mine');
  });
});
