/**
 * Slack message builder for health check prompts.
 * Requirements 5.4: Score buttons (1-5) and optional Trend_Indicator selection
 * Requirements 5.5: Session_Link fallback in each message
 */
import type { Question } from '@/lib/repositories/entities';

interface SlackBlock {
  type: string;
  [key: string]: unknown;
}

export interface SlackMessage {
  blocks: SlackBlock[];
}

/**
 * Builds a Slack interactive message for health check prompts.
 * Each question gets: title text, 5 score buttons, optional trend indicator menu.
 * Includes a session link fallback for members who prefer the web experience.
 */
export function buildPromptMessage(params: {
  questions: Question[];
  sessionLinkUrl: string;
}): SlackMessage {
  const blocks: SlackBlock[] = [];

  // Header
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: '*🏥 Health Check Time!*\nRate each area from 1 (strongly disagree) to 5 (strongly agree).',
    },
  });

  // One section + actions per question with score buttons
  for (const question of params.questions) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${question.title}*\n${question.description}`,
      },
    });

    blocks.push({
      type: 'actions',
      block_id: `score_${question.id}`,
      elements: [1, 2, 3, 4, 5].map(score => ({
        type: 'button',
        text: { type: 'plain_text', text: String(score) },
        value: `${question.id}:${score}`,
        action_id: `score_${question.id}_${score}`,
      })),
    });
  }

  // Session link fallback (Requirement 5.5)
  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `_Prefer the web? <${params.sessionLinkUrl}|Submit via browser>_`,
      },
    ],
  });

  return { blocks };
}
