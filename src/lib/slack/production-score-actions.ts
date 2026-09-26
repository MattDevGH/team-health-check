/**
 * The production dependencies for applying Slack score buttons.
 *
 * Requirements: 5.8, 5.10; NFR 1.2
 *
 * Two callers need the same set and must not drift apart: the interaction
 * route, which applies the buttons straight after acknowledging, and the
 * scheduler drain, which applies any that the route did not finish. Building
 * them in one place is what makes a replayed entry behave the same as a live
 * one.
 *
 * Separate from `score-actions.ts` on purpose — that module takes its
 * dependencies so it can be tested against fakes, and importing the production
 * container there would undo it.
 */

import { container, repos } from '@/lib/container-production';
import type { ScoreActionDeps } from '@/lib/slack/score-actions';

export function createProductionScoreActionDeps(): ScoreActionDeps {
  return {
    async findMemberBySlackUserId(slackUserId: string): Promise<string | null> {
      const link = await repos.slackIdentityLink.findBySlackUserId(slackUserId);
      return link?.memberId ?? null;
    },

    async findOpenSessionForMember(memberId: string): Promise<string | null> {
      const member = await repos.teamMember.findById(memberId);
      if (!member) return null;

      const session = await repos.session.findOpenByTeamId(member.teamId);
      return session?.id ?? null;
    },

    async questionTitle(questionId: string): Promise<string> {
      const question = await repos.question.findById(questionId);
      return question?.title ?? questionId;
    },

    async upsertResponse(params: {
      memberId: string;
      sessionId: string;
      questionId: string;
      score: number;
    }): Promise<void> {
      await container.response.upsert(params);
    },
  };
}
