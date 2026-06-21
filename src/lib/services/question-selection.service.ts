/**
 * Micro-pulse question selection service.
 * Implements weighted random selection for micro-pulse cadence members.
 * Requirements: 15.3, 15.4, 15.5
 */

import type {
  QuestionRepository,
  ResponseRepository,
  SessionRepository,
} from '@/lib/repositories/types';

export interface QuestionSelectionServiceDeps {
  questionRepo: QuestionRepository;
  responseRepo: ResponseRepository;
  sessionRepo: SessionRepository;
}

export interface QuestionSelectionService {
  selectForMember(
    memberId: string,
    sessionId: string,
    remainingDays: number
  ): Promise<string[]>;
}

/**
 * Factory function for creating the question selection service.
 * Implements weighted random selection that prefers unanswered questions
 * and weights by gap since last response.
 */
export function createQuestionSelectionService(
  deps: QuestionSelectionServiceDeps
): QuestionSelectionService {
  const { questionRepo, responseRepo, sessionRepo } = deps;

  async function selectForMember(
    memberId: string,
    sessionId: string,
    remainingDays: number
  ): Promise<string[]> {
    // 1. Get all 5 questions
    const questions = await questionRepo.findAll();
    const allQuestionIds = questions.map(q => q.id);

    // 2. Get member's responses for this session
    const sessionResponses = await responseRepo.findByMemberAndSession(
      memberId,
      sessionId
    );
    const answeredIds = new Set(sessionResponses.map(r => r.questionId));

    // 3. Determine unanswered questions
    const unansweredIds = allQuestionIds.filter(id => !answeredIds.has(id));

    // 4. If all answered, return []
    if (unansweredIds.length === 0) {
      return [];
    }

    // 5. Determine how many questions to send
    let count: number;
    if (remainingDays < unansweredIds.length) {
      // Bundle: distribute unanswered across remaining days
      count = Math.ceil(unansweredIds.length / remainingDays);
    } else {
      // Normal: send 1 question per day
      count = 1;
    }
    count = Math.min(count, unansweredIds.length);

    // 6. Calculate weights for each unanswered question
    const weights = await calculateWeights(memberId, sessionId, unansweredIds);

    // 7. Select questions using weighted random without replacement
    return weightedRandomSelection(unansweredIds, weights, count);
  }

  /**
   * Calculates selection weights for unanswered questions.
   * Weight is proportional to how many sessions since the question was last answered.
   * If never answered, assign maximum weight.
   */
  async function calculateWeights(
    memberId: string,
    currentSessionId: string,
    unansweredIds: string[]
  ): Promise<number[]> {
    // Find the session to get the teamId for historical lookup
    const currentSession = await sessionRepo.findById(currentSessionId);
    if (!currentSession) {
      // Fallback: uniform weights
      return unansweredIds.map(() => 1);
    }

    // Get all closed sessions for this team, ordered by creation (most recent first)
    const allSessions = await sessionRepo.findByTeamId(currentSession.teamId);
    const pastSessions = allSessions
      .filter(s => s.id !== currentSessionId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    // Build a map: questionId → number of sessions since last answered (by this member)
    const lastAnsweredGap = new Map<string, number>();

    for (const questionId of unansweredIds) {
      let gap = pastSessions.length + 1; // Default: never answered → max gap

      for (let i = 0; i < pastSessions.length; i++) {
        const responses = await responseRepo.findByMemberAndSession(
          memberId,
          pastSessions[i].id
        );
        const answered = responses.some(r => r.questionId === questionId);
        if (answered) {
          gap = i + 1; // Sessions since last answer (1-indexed)
          break;
        }
      }

      lastAnsweredGap.set(questionId, gap);
    }

    // Convert gaps to weights: higher gap → higher weight
    return unansweredIds.map(id => lastAnsweredGap.get(id) ?? 1);
  }

  return { selectForMember };
}

/**
 * Weighted random selection without replacement.
 * Selects `count` items from `items` with probability proportional to `weights`.
 */
function weightedRandomSelection(
  items: string[],
  weights: number[],
  count: number
): string[] {
  if (count >= items.length) {
    return [...items];
  }

  const selected: string[] = [];
  const remainingIndices = items.map((_, i) => i);
  const remainingWeights = [...weights];

  for (let i = 0; i < count; i++) {
    const totalWeight = remainingWeights.reduce((sum, w) => sum + w, 0);
    if (totalWeight === 0) break;

    let random = Math.random() * totalWeight;
    let selectedIdx = 0;

    for (let j = 0; j < remainingWeights.length; j++) {
      random -= remainingWeights[j];
      if (random <= 0) {
        selectedIdx = j;
        break;
      }
    }

    selected.push(items[remainingIndices[selectedIdx]]);
    remainingIndices.splice(selectedIdx, 1);
    remainingWeights.splice(selectedIdx, 1);
  }

  return selected;
}
