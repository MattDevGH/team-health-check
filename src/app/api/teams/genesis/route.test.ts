/**
 * Tests for POST /api/teams/genesis.
 * Validates: Requirements 1.5, 7.9
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { executeGenesis } = vi.hoisted(() => ({
  executeGenesis: vi.fn(),
}));

vi.mock('@/lib/container-production', () => ({
  container: { genesis: { executeGenesis } },
}));

import { POST } from './route';

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/teams/genesis', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/teams/genesis', () => {
  beforeEach(() => {
    executeGenesis.mockReset();
  });

  it.each([
    [{ teamName: 'A Team' }, 'token'],
    [{ token: 'pending-token' }, 'teamName'],
    [{ token: 123, teamName: 'A Team' }, 'token'],
    [{ token: 'pending-token', teamName: '' }, 'teamName'],
    [{ token: 'pending-token', teamName: 'A Team', description: 123 }, 'description'],
  ])('returns 400 when the JSON contract is invalid', async (body, field) => {
    const response = await POST(makeRequest(body));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
        errors: expect.arrayContaining([expect.objectContaining({ field })]),
      },
    });
    expect(executeGenesis).not.toHaveBeenCalled();
  });

  it('passes validated team details to genesis and sets the session cookie', async () => {
    executeGenesis.mockResolvedValue({
      teamId: 'team-1',
      memberId: 'member-1',
      sessionToken: 'session-token-abc',
    });

    const response = await POST(makeRequest({
      token: ' pending-token ',
      teamName: ' Platform Engineering ',
      description: 'Delivery platform',
    }));

    expect(executeGenesis).toHaveBeenCalledWith({
      token: 'pending-token',
      teamName: 'Platform Engineering',
      description: 'Delivery platform',
    });
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      teamId: 'team-1',
      memberId: 'member-1',
      sessionToken: 'session-token-abc',
    });
    const cookie = response.headers.get('Set-Cookie');
    expect(cookie).toContain('session=session-token-abc');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=lax');
    expect(cookie).toContain('Max-Age=604800');
  });

  it('accepts an omitted optional description', async () => {
    executeGenesis.mockResolvedValue({
      teamId: 'team-2',
      memberId: 'member-2',
      sessionToken: 'session-token-def',
    });

    const response = await POST(makeRequest({
      token: 'pending-token',
      teamName: 'No Description Team',
    }));

    expect(response.status).toBe(201);
    expect(executeGenesis).toHaveBeenCalledWith({
      token: 'pending-token',
      teamName: 'No Description Team',
    });
  });
});
