/**
 * Applying the score buttons from a Slack interaction.
 *
 * Requirements: 5.7, 5.8, 5.9, 5.10; Slack Sign In NFR 1.2
 *
 * This lived inside `/api/slack/interactions/route.ts`, which was fine while
 * the route did the work itself. It cannot stay there: the route acknowledges
 * before processing now, and the processing may be replayed by a scheduler
 * tick in a different process, so both callers need to reach the same code.
 *
 * Takes its dependencies rather than importing the production container, so a
 * test can drive it against in-memory fakes and the drain can supply whatever
 * it has.
 *
 * The Slack user id arrives from a payload whose signature was verified, and
 * is resolved to a member here. Requirement NFR 1.2 of the sign-in spec —
 * never accept a member id from a request body — is satisfied by there being
 * no member id in the payload to accept.
 */

import { parseScoreAction } from '@/lib/slack/interaction-payload';
import type { SlackAction } from '@/lib/slack/interaction-payload';
import {
  buildConfirmationText,
  buildScoreRejectionText,
  buildSessionEndedText,
  buildUnlinkedText,
} from '@/lib/slack/interaction-response';

/** What applying score actions needs, named rather than reached for. */
export interface ScoreActionDeps {
  findMemberBySlackUserId(slackUserId: string): Promise<string | null>;
  findOpenSessionForMember(memberId: string): Promise<string | null>;
  questionTitle(questionId: string): Promise<string>;
  upsertResponse(params: {
    memberId: string;
    sessionId: string;
    questionId: string;
    score: number;
  }): Promise<void>;
}

/**
 * The question id from a value that would not parse, for the rejection
 * message. Split on the last colon, matching `parseScoreAction`.
 */
function questionIdOf(value: string): string {
  const separator = value.lastIndexOf(':');
  return separator <= 0 ? value : value.slice(0, separator);
}

/**
 * Applies every score action in the payload and returns the member-visible
 * reply, or null when there is nothing worth saying.
 *
 * A failure to store one answer becomes a rejection line for that question and
 * the rest are still applied — losing four answers because the third one failed
 * would be a worse outcome than saying so.
 *
 * An infrastructure failure, such as the member lookup itself failing, is left
 * to propagate. The caller has already acknowledged Slack, and the drain that
 * replays this treats a throw as a delivery failure and retries it under the
 * queue backoff. Swallowing it here would turn a transient outage into a
 * silently dropped answer.
 */
export async function applyScoreActions(
  deps: ScoreActionDeps,
  payload: { slackUserId?: string; actions?: SlackAction[] },
): Promise<string | null> {
  const slackUserId = payload.slackUserId;
  if (!slackUserId) {
    // Nobody to resolve, and so nobody to reply to
    return null;
  }

  const memberId = await deps.findMemberBySlackUserId(slackUserId);
  if (!memberId) {
    return buildUnlinkedText();
  }

  const sessionId = await deps.findOpenSessionForMember(memberId);
  if (!sessionId) {
    // Requirement 5.9: the session ended, so say so rather than storing
    return buildSessionEndedText();
  }

  const lines: string[] = [];

  for (const action of payload.actions ?? []) {
    if (!action.actionId?.startsWith('score_') || !action.value) {
      continue;
    }

    const parsed = parseScoreAction(action.value);
    if (!parsed) {
      // Requirement 5.7: a validation error naming the affected question
      lines.push(buildScoreRejectionText(await deps.questionTitle(questionIdOf(action.value))));
      continue;
    }

    try {
      await deps.upsertResponse({
        memberId,
        sessionId,
        questionId: parsed.questionId,
        score: parsed.score,
      });
      // Requirement 5.8: confirm the stored score
      lines.push(buildConfirmationText(await deps.questionTitle(parsed.questionId), parsed.score));
    } catch {
      lines.push(buildScoreRejectionText(await deps.questionTitle(parsed.questionId)));
    }
  }

  return lines.length > 0 ? lines.join('\n') : null;
}
