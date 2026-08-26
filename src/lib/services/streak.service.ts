/**
 * Streak calculation service.
 * Tracks consecutive participation streaks for team members.
 * Requirements: 17.1, 17.3, 17.4, 17.7
 */

import type {
  SessionRepository,
  ResponseRepository,
  AvailabilityRepository,
  TeamMemberRepository,
} from '@/lib/repositories/types';
import type { HealthCheckSession } from '@/lib/repositories/entities';
import { NotFoundError } from '@/lib/errors';

const GRACE_PERIOD_DAYS = 14;

export interface StreakServiceDeps {
  sessionRepo: SessionRepository;
  responseRepo: ResponseRepository;
  availabilityRepo: AvailabilityRepository;
  teamMemberRepo: TeamMemberRepository;
}

export interface StreakService {
  calculate(memberId: string): Promise<{ current: number; best: number }>;
}

/**
 * Factory function for creating the streak service.
 */
export function createStreakService(deps: StreakServiceDeps): StreakService {
  const { sessionRepo, responseRepo, availabilityRepo, teamMemberRepo } = deps;

  async function calculate(memberId: string): Promise<{ current: number; best: number }> {
    // 1. Find the member's team
    const member = await teamMemberRepo.findById(memberId);
    if (!member) {
      throw new NotFoundError('Member not found');
    }

    // 2. Get all closed sessions for that team, ordered chronologically (oldest first)
    const allSessions = await sessionRepo.findByTeamId(member.teamId);
    const closedSessions = allSessions
      .filter((s): s is HealthCheckSession & { actualCloseAt: Date } =>
        s.status === 'closed' && s.actualCloseAt !== null
      )
      .sort((a, b) => a.actualCloseAt.getTime() - b.actualCloseAt.getTime());

    if (closedSessions.length === 0) {
      return { current: 0, best: 0 };
    }

    // 3. For each session, determine participation status
    let currentStreak = 0;
    let bestStreak = 0;
    let graceAvailable = true;
    let lastMissWasGraced = false;
    let previousSessionCloseAt: Date | null = null;

    for (const session of closedSessions) {
      // a. Was member away? → skip (doesn't break or count towards streak)
      const availability = await availabilityRepo.findActiveByMemberIdAndDate(
        memberId,
        session.actualCloseAt
      );
      if (availability) {
        // Away session: skip entirely, don't affect streak state
        previousSessionCloseAt = session.actualCloseAt;
        continue;
      }

      // b. Did member respond (≥1 response)?
      const responses = await responseRepo.findByMemberAndSession(memberId, session.id);
      const didRespond = responses.length > 0;

      if (didRespond) {
        // Responded: increment streak, reset miss tracking
        currentStreak++;
        lastMissWasGraced = false;
        if (currentStreak > bestStreak) {
          bestStreak = currentStreak;
        }
      } else {
        // c. Did member NOT respond (miss)
        if (lastMissWasGraced) {
          // Second consecutive miss (previous was graced): break streak
          currentStreak = 0;
          lastMissWasGraced = false;
          graceAvailable = true;
        } else if (graceAvailable && previousSessionCloseAt !== null) {
          // First miss: check if within grace period (14 days from previous session)
          const daysBetween =
            (session.actualCloseAt.getTime() - previousSessionCloseAt.getTime()) /
            (24 * 60 * 60 * 1000);

          if (daysBetween <= GRACE_PERIOD_DAYS) {
            // Grace period applies: forgive this miss, streak is preserved (not incremented)
            lastMissWasGraced = true;
            graceAvailable = false;
          } else {
            // Gap too large: reset streak
            currentStreak = 0;
            lastMissWasGraced = false;
          }
        } else {
          // No grace available or no previous session: reset streak
          currentStreak = 0;
          lastMissWasGraced = false;
        }
      }

      previousSessionCloseAt = session.actualCloseAt;
    }

    return { current: currentStreak, best: bestStreak };
  }

  return { calculate };
}
