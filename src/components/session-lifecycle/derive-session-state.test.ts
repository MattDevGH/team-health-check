/**
 * Tests for Session_State derivation.
 * Requirements: Manager Experience 2.4, 2.7
 *
 * TDD: Red phase — these define the behaviour before the function exists.
 *
 * A manager looking at the dashboard needs to know one thing: what is happening
 * right now, and what can I do about it. That is a pure function of the team's
 * sessions plus which of them have had their aggregates materialised, so it is
 * tested here rather than through the component.
 *
 * The materialisation distinction matters because closing does not compute
 * results: `PATCH /sessions/[id]` closes, and a scheduler tick materialises at
 * least 30 seconds later (`scheduler.service.ts`). Between the two a manager
 * sees a closed session with no data, which must not read as "nobody answered".
 */

import { describe, it, expect } from 'vitest';

import type { HealthCheckSession } from '@/lib/repositories/entities';
import { deriveSessionState } from './derive-session-state';

function session(overrides: Partial<HealthCheckSession> & { id: string }): HealthCheckSession {
  return {
    teamId: 'team-1',
    status: 'closed',
    scheduledOpenAt: null,
    scheduledCloseAt: null,
    actualOpenAt: new Date('2026-08-01T09:00:00.000Z'),
    actualCloseAt: new Date('2026-08-05T17:00:00.000Z'),
    createdAt: new Date('2026-08-01T09:00:00.000Z'),
    ...overrides,
  };
}

describe('deriveSessionState', () => {
  it('reports that no health check has run when there are no sessions', () => {
    const state = deriveSessionState([], new Set());

    expect(state.status).toBe('never_run');
    expect(state.control).toBe('open');
  });

  it('reports collecting while a session is open', () => {
    const open = session({
      id: 'open-1',
      status: 'open',
      actualCloseAt: null,
      scheduledCloseAt: new Date('2026-08-28T17:00:00.000Z'),
    });

    const state = deriveSessionState([open], new Set());

    expect(state.status).toBe('collecting');
    expect(state.control).toBe('close');
    expect(state.status === 'collecting' && state.session.id).toBe('open-1');
  });

  it('prefers the open session even when closed ones exist', () => {
    const state = deriveSessionState(
      [
        session({ id: 'closed-1' }),
        session({ id: 'open-1', status: 'open', actualCloseAt: null }),
        session({ id: 'closed-2' }),
      ],
      new Set(['closed-1', 'closed-2']),
    );

    expect(state.status).toBe('collecting');
    expect(state.status === 'collecting' && state.session.id).toBe('open-1');
  });

  it('reports the last check once its results have been materialised', () => {
    const state = deriveSessionState([session({ id: 'closed-1' })], new Set(['closed-1']));

    expect(state.status).toBe('idle');
    expect(state.control).toBe('open');
    expect(state.status === 'idle' && state.lastClosed.id).toBe('closed-1');
  });

  it('distinguishes a closed session still awaiting its results', () => {
    // Closing does not materialise aggregates; a scheduler tick does, at least
    // 30 seconds later. Presenting this as "no data" would read as nobody
    // having answered.
    const state = deriveSessionState([session({ id: 'closed-1' })], new Set());

    expect(state.status).toBe('awaiting_results');
    expect(state.control).toBe('open');
    expect(state.status === 'awaiting_results' && state.session.id).toBe('closed-1');
  });

  it('judges the latest closed session by when it closed, not by array order', () => {
    // The sessions endpoint gives no ordering guarantee, and reading the array
    // as ordered would show a manager the wrong check
    const older = session({ id: 'older', actualCloseAt: new Date('2026-08-01T17:00:00.000Z') });
    const newer = session({ id: 'newer', actualCloseAt: new Date('2026-08-20T17:00:00.000Z') });

    const state = deriveSessionState([newer, older], new Set(['older', 'newer']));

    expect(state.status === 'idle' && state.lastClosed.id).toBe('newer');
  });

  it('treats a closed session with no close time as older than one with', () => {
    const undated = session({ id: 'undated', actualCloseAt: null });
    const dated = session({ id: 'dated', actualCloseAt: new Date('2026-08-02T17:00:00.000Z') });

    const state = deriveSessionState([undated, dated], new Set(['undated', 'dated']));

    expect(state.status === 'idle' && state.lastClosed.id).toBe('dated');
  });

  it('ignores materialisation of sessions other than the latest', () => {
    const older = session({ id: 'older', actualCloseAt: new Date('2026-08-01T17:00:00.000Z') });
    const newer = session({ id: 'newer', actualCloseAt: new Date('2026-08-20T17:00:00.000Z') });

    // Only the older one has results; the newest is still awaiting its own
    const state = deriveSessionState([older, newer], new Set(['older']));

    expect(state.status).toBe('awaiting_results');
    expect(state.status === 'awaiting_results' && state.session.id).toBe('newer');
  });
});
