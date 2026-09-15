/**
 * The reads a trends response is built from.
 *
 * Requirements: Feeling Responsive 3.1, 3.3
 *
 * The route awaited four independent reads one after another — the privacy
 * mode, the question catalogue, the team's sessions, and their averages. Given
 * a team id none of them needs any of the others, so three were waiting for no
 * reason.
 *
 * Narrow function types rather than repository interfaces, because these come
 * from three different places: two services and a repository. What matters here
 * is the shape of the dependency graph, not who owns each edge.
 *
 * **Authorisation is not in here.** It happens in the route, before this is
 * called, and it must stay that way: reads about a team a member may not belong
 * to should not be in flight while the check that says so is still running.
 */

import type { HealthCheckSession, Question } from '@/lib/repositories/entities';

/** One question theme's average for one session, as the trend service reports it. */
export interface SessionAverageRow {
  sessionId: string;
  questionId: string;
  averageScore: number | null;
  responseCount: number;
}

export interface TrendInputsDeps {
  getPrivacyMode(teamId: string): Promise<string>;
  findQuestions(): Promise<Question[]>;
  findSessions(teamId: string): Promise<HealthCheckSession[]>;
  getSessionAverages(teamId: string): Promise<SessionAverageRow[]>;
}

export interface TrendInputs {
  privacyMode: string;
  questions: Question[];
  sessions: HealthCheckSession[];
  averages: SessionAverageRow[];
}

export async function loadTrendInputs(
  deps: TrendInputsDeps,
  teamId: string,
): Promise<TrendInputs> {
  const [privacyMode, questions, sessions, averages] = await Promise.all([
    deps.getPrivacyMode(teamId),
    deps.findQuestions(),
    deps.findSessions(teamId),
    deps.getSessionAverages(teamId),
  ]);

  return { privacyMode, questions, sessions, averages };
}
