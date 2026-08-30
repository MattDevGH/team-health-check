/**
 * Property Tests for Session_State derivation.
 *
 * Feature: manager-experience, Property 2: exactly one state, matching control
 *
 * **Validates: Requirements 2.1, 2.3, 2.4, 2.7**
 *
 * For any list of sessions and any set of materialised session ids, exactly one
 * Session_State is derivable, and the control offered matches it: close while
 * responses are being collected, open otherwise.
 *
 * The example tests cover the four states the design names. This covers the
 * shapes a real team produces over months that nobody writes an example for:
 * many closed sessions, duplicate close times, sessions closed with no close
 * time recorded, and materialisation sets that mention sessions this team never
 * had. A derivation that falls through its own branches — returning undefined,
 * or offering "close" with nothing open — passes every example above and fails
 * here.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import type { HealthCheckSession } from '@/lib/repositories/entities';
import { deriveSessionState } from './derive-session-state';

const EPOCH = Date.UTC(2026, 0, 1);

/**
 * Close times drawn from a small pool so duplicates and ties actually occur.
 * Fully random dates would almost never collide, leaving tie-breaking untested.
 */
const closeAtArb = fc.oneof(
  fc.constant(null),
  fc.integer({ min: 0, max: 5 }).map(days => new Date(EPOCH + days * 86_400_000)),
);

const sessionArb = fc
  .record({
    id: fc.stringMatching(/^s[0-9]{1,3}$/),
    status: fc.constantFrom('open', 'closed'),
    actualCloseAt: closeAtArb,
  })
  .map(
    ({ id, status, actualCloseAt }): HealthCheckSession => ({
      id,
      teamId: 'team-1',
      status,
      scheduledOpenAt: null,
      scheduledCloseAt: null,
      actualOpenAt: new Date(EPOCH),
      // An open session has not closed, whatever the generator produced
      actualCloseAt: status === 'open' ? null : actualCloseAt,
      createdAt: new Date(EPOCH),
    }),
  );

const STATUSES = ['collecting', 'awaiting_results', 'idle', 'never_run'];

describe('Property 2: exactly one session state, with a matching control', () => {
  it('derives one known state and the control it implies', () => {
    fc.assert(
      fc.property(
        fc.array(sessionArb, { maxLength: 8 }),
        fc.array(fc.stringMatching(/^s[0-9]{1,3}$/), { maxLength: 8 }),
        (sessions, materialisedIds) => {
          const state = deriveSessionState(sessions, new Set(materialisedIds));

          expect(STATUSES).toContain(state.status);

          // The control is what the manager is offered, so it must never
          // contradict what they are being told is happening
          expect(state.control).toBe(state.status === 'collecting' ? 'close' : 'open');
        },
      ),
    );
  });

  it('offers close if and only if a session is open', () => {
    fc.assert(
      fc.property(
        fc.array(sessionArb, { maxLength: 8 }),
        fc.array(fc.stringMatching(/^s[0-9]{1,3}$/), { maxLength: 8 }),
        (sessions, materialisedIds) => {
          const state = deriveSessionState(sessions, new Set(materialisedIds));
          const anyOpen = sessions.some(s => s.status === 'open');

          expect(state.control === 'close').toBe(anyOpen);
        },
      ),
    );
  });

  it('never reports a closed session as awaiting results once they exist', () => {
    fc.assert(
      fc.property(
        fc.array(sessionArb, { maxLength: 8 }),
        fc.array(fc.stringMatching(/^s[0-9]{1,3}$/), { maxLength: 8 }),
        (sessions, materialisedIds) => {
          const materialised = new Set(materialisedIds);
          const state = deriveSessionState(sessions, materialised);

          if (state.status === 'awaiting_results') {
            expect(materialised.has(state.session.id)).toBe(false);
          }
          if (state.status === 'idle') {
            expect(materialised.has(state.lastClosed.id)).toBe(true);
          }
        },
      ),
    );
  });
});
