import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createInMemoryRepositories } from '@/lib/repositories';
import { createSessionService } from '@/lib/services/session.service';
import { ConflictError } from '@/lib/errors';

/**
 * Arbitrary operation type for session lifecycle commands.
 * - 'open': opens a new session for the team
 * - 'close': closes a previously opened session by index
 */
type Operation = { type: 'open' } | { type: 'close'; sessionIndex: number };

/**
 * Generates a random sequence of open/close operations.
 * sessionIndex references the nth session opened so far (0-based).
 */
const operationSequenceArb = fc.array(
  fc.oneof(
    fc.constant<Operation>({ type: 'open' }),
    fc.nat({ max: 20 }).map<Operation>((n) => ({ type: 'close', sessionIndex: n }))
  ),
  { minLength: 1, maxLength: 30 }
);

describe('Session Lifecycle Properties', () => {
  /**
   * **Validates: Requirements 3.8, 3.9**
   *
   * Property 31: At-most-one open session per team (Highlander invariant)
   *
   * For any arbitrary sequence of open/close operations executed against
   * the same team, there SHALL never be more than 1 session with status
   * "open" for that team at any point in time.
   */
  describe('Property 31: At-most-one open session per team (Highlander invariant)', () => {
    it('never has more than 1 open session per team after any operation', async () => {
      await fc.assert(
        fc.asyncProperty(operationSequenceArb, async (operations) => {
          const repos = createInMemoryRepositories();
          const sessionService = createSessionService({
            sessionRepo: repos.session,
            sessionLinkRepo: repos.sessionLink,
            teamMemberRepo: repos.teamMember,
            responseRepo: repos.response,
            sessionAggregateRepo: repos.sessionAggregate,
          });

          const teamId = 'team-highlander';
          const userId = 'user-1';
          const openedSessionIds: string[] = [];

          for (const op of operations) {
            if (op.type === 'open') {
              const session = await sessionService.open(teamId, userId);
              openedSessionIds.push(session.id);
            } else {
              // Close by index — may reference a non-existent or already-closed session
              const targetId = openedSessionIds[op.sessionIndex];
              if (targetId) {
                try {
                  await sessionService.close(targetId, userId);
                } catch (err: unknown) {
                  // ConflictError on double-close is expected behaviour
                  expect(err).toBeInstanceOf(ConflictError);
                }
              }
              // If targetId is undefined (out of bounds), skip — no session to close
            }

            // INVARIANT CHECK: after every operation, at most 1 open session exists
            const allSessions = await repos.session.findByTeamId(teamId);
            const openSessions = allSessions.filter((s) => s.status === 'open');
            expect(openSessions.length).toBeLessThanOrEqual(1);
          }
        }),
        { numRuns: 100 }
      );
    });
  });
});
