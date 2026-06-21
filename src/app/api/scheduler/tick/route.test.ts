/**
 * Unit tests for POST /api/scheduler/tick route handler.
 * Validates: Requirements 3.2, 3.3
 *
 * Tests cover:
 * - CRON_SECRET authentication (env-based)
 * - Successful tick invocation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies — route handler constructs repos and services internally
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/services/scheduler.service', () => ({ createSchedulerService: vi.fn() }));
vi.mock('@/lib/services/session.service', () => ({ createSessionService: vi.fn() }));
vi.mock('@/lib/repositories/prisma/team.repository', () => ({
  PrismaTeamRepository: vi.fn().mockImplementation(() => ({})),
}));
vi.mock('@/lib/repositories/prisma/session.repository', () => ({
  PrismaSessionRepository: vi.fn().mockImplementation(() => ({})),
}));
vi.mock('@/lib/repositories/prisma/session-aggregate.repository', () => ({
  PrismaSessionAggregateRepository: vi.fn().mockImplementation(() => ({})),
}));
vi.mock('@/lib/repositories/prisma/session-link.repository', () => ({
  PrismaSessionLinkRepository: vi.fn().mockImplementation(() => ({})),
}));
vi.mock('@/lib/repositories/prisma/team-member.repository', () => ({
  PrismaTeamMemberRepository: vi.fn().mockImplementation(() => ({})),
}));
vi.mock('@/lib/repositories/prisma/response.repository', () => ({
  PrismaResponseRepository: vi.fn().mockImplementation(() => ({})),
}));
vi.mock('@/lib/repositories/prisma/team-schedule.repository', () => ({
  PrismaTeamScheduleRepository: vi.fn().mockImplementation(() => ({})),
}));

import { createSchedulerService } from '@/lib/services/scheduler.service';
import { POST } from './route';

describe('POST /api/scheduler/tick', () => {
  const originalEnv = process.env;
  const mockTick = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = { ...originalEnv, CRON_SECRET: 'test-secret-123' };
    vi.mocked(createSchedulerService).mockReturnValue({ tick: mockTick });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns 403 when Authorization header is missing', async () => {
    const request = new Request('http://localhost/api/scheduler/tick', {
      method: 'POST',
    });

    const response = await POST(request);
    expect(response.status).toBe(403);

    const body = await response.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('returns 403 when Authorization header has wrong secret', async () => {
    const request = new Request('http://localhost/api/scheduler/tick', {
      method: 'POST',
      headers: { Authorization: 'Bearer wrong-secret' },
    });

    const response = await POST(request);
    expect(response.status).toBe(403);

    const body = await response.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('returns 403 when CRON_SECRET env var is not set', async () => {
    delete process.env.CRON_SECRET;

    const request = new Request('http://localhost/api/scheduler/tick', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-secret-123' },
    });

    const response = await POST(request);
    expect(response.status).toBe(403);

    const body = await response.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('returns 200 and calls scheduler.tick() with valid secret', async () => {
    const request = new Request('http://localhost/api/scheduler/tick', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-secret-123' },
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toEqual({ ok: true });
    expect(mockTick).toHaveBeenCalledTimes(1);
    expect(mockTick).toHaveBeenCalledWith(expect.any(Date));
  });

  it('returns 403 when Authorization header uses wrong scheme', async () => {
    const request = new Request('http://localhost/api/scheduler/tick', {
      method: 'POST',
      headers: { Authorization: 'Basic test-secret-123' },
    });

    const response = await POST(request);
    expect(response.status).toBe(403);
  });
});
