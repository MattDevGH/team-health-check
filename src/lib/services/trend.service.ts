/**
 * Trend data retrieval service.
 * Requirements: 8.1, 8.5, 8.6, 8.7
 */

import type {
  SessionAggregateRepository,
  SessionRepository,
  TeamRepository,
} from '@/lib/repositories/types';
import type { HealthCheckSession } from '@/lib/repositories/entities';

export interface SessionAverage {
  sessionId: string;
  questionId: string;
  averageScore: number | null;
  responseCount: number;
  sessionDate: Date;
  suppressed?: boolean;
}

export interface TrendDistribution {
  questionId: string;
  improvingCount: number;
  stableCount: number;
  decliningCount: number;
}

export interface TrendServiceDeps {
  sessionAggregateRepo: SessionAggregateRepository;
  sessionRepo: SessionRepository;
  teamRepo: TeamRepository;
}

export interface TrendServiceOptions {
  anonymityThreshold?: number;
}

const DEFAULT_ANONYMITY_THRESHOLD = 3;

/**
 * Factory function for creating the trend service.
 */
export function createTrendService(deps: TrendServiceDeps, options?: TrendServiceOptions) {
  const { sessionAggregateRepo, sessionRepo, teamRepo } = deps;
  const anonymityThreshold = options?.anonymityThreshold ?? DEFAULT_ANONYMITY_THRESHOLD;

  async function getSessionAverages(teamId: string, questionId?: string): Promise<SessionAverage[]> {
    // 1. Get all aggregates for this team
    const aggregates = await sessionAggregateRepo.findByTeamId(teamId);

    // 2. Filter by questionId if provided
    const filtered = questionId
      ? aggregates.filter(a => a.questionId === questionId)
      : aggregates;

    // 3. Filter out aggregates where responseCount === 0
    const nonZero = filtered.filter(a => a.responseCount > 0);

    // 4. Get team privacy mode
    const team = await teamRepo.findById(teamId);
    const isAnonymous = team?.privacyMode === 'anonymous';

    // 5. Get sessions for date ordering
    const sessions = await sessionRepo.findByTeamId(teamId);
    const sessionMap = new Map<string, HealthCheckSession>();
    for (const session of sessions) {
      sessionMap.set(session.id, session);
    }

    // 6. Build result with suppression logic
    const results: SessionAverage[] = nonZero.map(aggregate => {
      const session = sessionMap.get(aggregate.sessionId);
      const sessionDate = session?.createdAt ?? new Date(0);

      // If anonymous mode and below threshold: suppress
      if (isAnonymous && aggregate.responseCount < anonymityThreshold) {
        return {
          sessionId: aggregate.sessionId,
          questionId: aggregate.questionId,
          averageScore: null,
          responseCount: aggregate.responseCount,
          sessionDate,
          suppressed: true,
        };
      }

      return {
        sessionId: aggregate.sessionId,
        questionId: aggregate.questionId,
        averageScore: aggregate.averageScore,
        responseCount: aggregate.responseCount,
        sessionDate,
      };
    });

    // 7. Sort by session date (chronological)
    results.sort((a, b) => a.sessionDate.getTime() - b.sessionDate.getTime());

    return results;
  }

  async function getTrendIndicatorDistribution(sessionId: string): Promise<TrendDistribution[]> {
    // 1. Get aggregates for the session
    const aggregates = await sessionAggregateRepo.findBySessionId(sessionId);

    // 2. For each aggregate, return the trend indicator distribution
    return aggregates.map(aggregate => ({
      questionId: aggregate.questionId,
      improvingCount: aggregate.improvingCount,
      stableCount: aggregate.stableCount,
      decliningCount: aggregate.decliningCount,
    }));
  }

  async function exportCSV(teamId: string, dateRange?: { from: Date; to: Date }): Promise<string> {
    // 1. Get all session averages (reuse getSessionAverages logic)
    const averages = await getSessionAverages(teamId);

    // 2. Apply date range filter if provided
    const filtered = dateRange
      ? averages.filter(a => a.sessionDate >= dateRange.from && a.sessionDate <= dateRange.to)
      : averages;

    // 3. Get trend indicator distributions for each session
    const sessionIds = [...new Set(filtered.map(a => a.sessionId))];
    const distributionsBySession = new Map<string, Map<string, TrendDistribution>>();

    for (const sessionId of sessionIds) {
      const distributions = await getTrendIndicatorDistribution(sessionId);
      const byQuestion = new Map<string, TrendDistribution>();
      for (const dist of distributions) {
        byQuestion.set(dist.questionId, dist);
      }
      distributionsBySession.set(sessionId, byQuestion);
    }

    // 4. Generate CSV string
    const header = 'Session Date,Question,Average Score,Response Count,Improving,Stable,Declining';
    const rows: string[] = [header];

    for (const avg of filtered) {
      const dateStr = avg.sessionDate.toISOString();
      const dist = distributionsBySession.get(avg.sessionId)?.get(avg.questionId);

      if (avg.suppressed) {
        // For suppressed aggregates: show "insufficient data" instead of score
        rows.push(`${dateStr},${avg.questionId},insufficient data,${avg.responseCount},${dist?.improvingCount ?? 0},${dist?.stableCount ?? 0},${dist?.decliningCount ?? 0}`);
      } else {
        rows.push(`${dateStr},${avg.questionId},${avg.averageScore},${avg.responseCount},${dist?.improvingCount ?? 0},${dist?.stableCount ?? 0},${dist?.decliningCount ?? 0}`);
      }
    }

    // 5. In anonymous mode, NEVER include individual member data
    //    (inherent since we only use aggregates from getSessionAverages)

    // 6. Return CSV string
    return rows.join('\n');
  }

  return { getSessionAverages, getTrendIndicatorDistribution, exportCSV };
}
