/**
 * Tests for GET /api/teams/[teamId]/sessions/[sessionId]/participation
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6
 */

import { describe, it, expect } from 'vitest';
import { GET, _testRepos as repos } from './route';

function makeContext(teamId: string, sessionId: string) {
  return { params: Promise.resolve({ teamId, sessionId }) };
}

function makeRequest(teamId: string, sessionId: string, userId?: string) {
  const headers: Record<string, string> = {};
  if (userId) {
    headers['x-user-id'] = userId;
  }
  return new Request(
    `http://localhost/api/teams/${teamId}/sessions/${sessionId}/participation`,
    { headers }
  );
}

describe('GET /api/teams/[teamId]/sessions/[sessionId]/participation', () => {
  it('returns 403 when x-user-id header is missing (Req 11.6)', async () => {
    const team = await repos.team.create({ name: 'Part Team 1' });
    const session = await repos.session.create({ teamId: team.id, status: 'open' });

    const response = await GET(makeRequest(team.id, session.id), makeContext(team.id, session.id));
    expect(response.status).toBe(403);
  });

  it('returns 403 when user is not a member of the team (Req 11.6)', async () => {
    const team = await repos.team.create({ name: 'Part Team 2' });
    const otherTeam = await repos.team.create({ name: 'Other Team' });
    const outsider = await repos.teamMember.create({ teamId: otherTeam.id, name: 'Outsider' });
    const session = await repos.session.create({ teamId: team.id, status: 'open' });

    const response = await GET(
      makeRequest(team.id, session.id, outsider.id),
      makeContext(team.id, session.id)
    );
    expect(response.status).toBe(403);
  });

  it('returns responded count and total count (Req 11.1)', async () => {
    const team = await repos.team.create({ name: 'Count Team', privacyMode: 'attributed' });
    const member1 = await repos.teamMember.create({ teamId: team.id, name: 'Alice' });
    const member2 = await repos.teamMember.create({ teamId: team.id, name: 'Bob' });
    const member3 = await repos.teamMember.create({ teamId: team.id, name: 'Charlie' });
    const session = await repos.session.create({ teamId: team.id, status: 'open' });

    // Only member1 responded
    await repos.response.upsert({
      memberId: member1.id,
      sessionId: session.id,
      questionId: 'q1',
      score: 4,
    });

    const response = await GET(
      makeRequest(team.id, session.id, member1.id),
      makeContext(team.id, session.id)
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.totalCount).toBe(3);
    expect(body.respondedCount).toBe(1);
  });

  it('in anonymous mode, returns non-responder names to delivery_manager (Req 11.2)', async () => {
    const team = await repos.team.create({ name: 'Anon DM Team', privacyMode: 'anonymous' });
    const dm = await repos.teamMember.create({ teamId: team.id, name: 'DM' });
    await repos.teamMemberRole.assign({ memberId: dm.id, teamId: team.id, role: 'delivery_manager' });
    const member = await repos.teamMember.create({ teamId: team.id, name: 'Regular' });
    const session = await repos.session.create({ teamId: team.id, status: 'open' });

    // DM responded, Regular did not
    await repos.response.upsert({
      memberId: dm.id,
      sessionId: session.id,
      questionId: 'q1',
      score: 3,
    });

    const response = await GET(
      makeRequest(team.id, session.id, dm.id),
      makeContext(team.id, session.id)
    );
    const body = await response.json();

    expect(body.nonResponders).toEqual([{ id: member.id, name: 'Regular' }]);
  });

  it('in anonymous mode, hides non-responder names from regular team members (Req 11.2)', async () => {
    const team = await repos.team.create({ name: 'Anon Regular Team', privacyMode: 'anonymous' });
    const dm = await repos.teamMember.create({ teamId: team.id, name: 'DM' });
    await repos.teamMemberRole.assign({ memberId: dm.id, teamId: team.id, role: 'delivery_manager' });
    const member = await repos.teamMember.create({ teamId: team.id, name: 'Regular' });
    const session = await repos.session.create({ teamId: team.id, status: 'open' });

    const response = await GET(
      makeRequest(team.id, session.id, member.id),
      makeContext(team.id, session.id)
    );
    const body = await response.json();

    // Counts are still visible
    expect(body.totalCount).toBe(2);
    expect(body.respondedCount).toBe(0);
    // Non-responder names hidden
    expect(body.nonResponders).toEqual([]);
  });

  it('in attributed mode, shows non-responder names to all team members (Req 11.3)', async () => {
    const team = await repos.team.create({ name: 'Attr Team', privacyMode: 'attributed' });
    const member1 = await repos.teamMember.create({ teamId: team.id, name: 'Alice' });
    const member2 = await repos.teamMember.create({ teamId: team.id, name: 'Bob' });
    const session = await repos.session.create({ teamId: team.id, status: 'open' });

    // member1 responded
    await repos.response.upsert({
      memberId: member1.id,
      sessionId: session.id,
      questionId: 'q1',
      score: 5,
    });

    // member2 requests participation view
    const response = await GET(
      makeRequest(team.id, session.id, member2.id),
      makeContext(team.id, session.id)
    );
    const body = await response.json();

    expect(body.nonResponders).toEqual([{ id: member2.id, name: 'Bob' }]);
  });

  it('does not reveal individual scores or trend indicators (Req 11.4)', async () => {
    const team = await repos.team.create({ name: 'No Scores Team', privacyMode: 'attributed' });
    const member = await repos.teamMember.create({ teamId: team.id, name: 'Alice' });
    const session = await repos.session.create({ teamId: team.id, status: 'open' });

    await repos.response.upsert({
      memberId: member.id,
      sessionId: session.id,
      questionId: 'q1',
      score: 4,
      trendIndicator: 'improving',
    });

    const response = await GET(
      makeRequest(team.id, session.id, member.id),
      makeContext(team.id, session.id)
    );
    const body = await response.json();

    // Ensure no score or trend indicator data is in the response
    const bodyStr = JSON.stringify(body);
    expect(bodyStr).not.toContain('"score"');
    expect(bodyStr).not.toContain('"trendIndicator"');
  });

  it('returns participation data for closed sessions (Req 11.5)', async () => {
    const team = await repos.team.create({ name: 'Closed Part Team', privacyMode: 'attributed' });
    const member1 = await repos.teamMember.create({ teamId: team.id, name: 'Alice' });
    const member2 = await repos.teamMember.create({ teamId: team.id, name: 'Bob' });
    const session = await repos.session.create({ teamId: team.id, status: 'closed' });

    await repos.response.upsert({
      memberId: member1.id,
      sessionId: session.id,
      questionId: 'q1',
      score: 3,
    });

    const response = await GET(
      makeRequest(team.id, session.id, member1.id),
      makeContext(team.id, session.id)
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.totalCount).toBe(2);
    expect(body.respondedCount).toBe(1);
    expect(body.nonResponders).toEqual([{ id: member2.id, name: 'Bob' }]);
  });

  it('returns 404 when session does not exist', async () => {
    const team = await repos.team.create({ name: 'No Session Part Team' });
    const member = await repos.teamMember.create({ teamId: team.id, name: 'Alice' });

    const response = await GET(
      makeRequest(team.id, 'non-existent', member.id),
      makeContext(team.id, 'non-existent')
    );
    expect(response.status).toBe(404);
  });
});
