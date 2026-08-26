/**
 * Tests for the closing reminder Slack message.
 *
 * Requirement 13.4: the reminder must indicate the feedback window is closing
 * soon and provide a direct session link. Task 24.5 acceptance found the
 * reminder rendering as an ordinary opening prompt, indistinguishable from one.
 *
 * Requirements: Original 13.2, 13.4
 */

import { describe, it, expect } from 'vitest';

import { buildClosingReminderMessage } from './message-builder';
import type { Question } from '@/lib/repositories/entities';

const QUESTIONS: Question[] = [
  { id: 'q-ease-of-delivery', title: 'Ease of Delivery', description: 'How easy is it?', displayOrder: 3 },
  { id: 'q-learning-improving', title: 'Learning and Improving', description: 'Do we learn?', displayOrder: 4 },
];

const SESSION_LINK = 'https://health.example.com/session/abc123';
const CLOSES_AT = new Date('2026-08-28T16:00:00.000Z');

function textOf(message: { blocks: Array<Record<string, unknown>> }): string {
  return JSON.stringify(message.blocks);
}

describe('buildClosingReminderMessage', () => {
  it('says the window is closing rather than inviting a fresh health check', () => {
    const message = buildClosingReminderMessage({
      questions: QUESTIONS,
      sessionLinkUrl: SESSION_LINK,
      closesAt: CLOSES_AT,
    });
    const serialised = textOf(message);

    expect(serialised.toLowerCase()).toContain('closing');
    // Must not reuse the opening prompt's headline
    expect(serialised).not.toContain('Health Check Time!');
  });

  it('punctuates between the headline and the close date', () => {
    const message = buildClosingReminderMessage({
      questions: QUESTIONS,
      sessionLinkUrl: SESSION_LINK,
      closesAt: CLOSES_AT,
    });

    // Bolding "closing soon" without a full stop ran the sentences together
    expect(textOf(message)).not.toMatch(/soon\*? It closes/);
  });

  it('states when the session closes', () => {
    const message = buildClosingReminderMessage({
      questions: QUESTIONS,
      sessionLinkUrl: SESSION_LINK,
      closesAt: CLOSES_AT,
    });

    expect(textOf(message)).toContain('2026-08-28');
  });

  it('keeps score buttons for each outstanding question', () => {
    const message = buildClosingReminderMessage({
      questions: QUESTIONS,
      sessionLinkUrl: SESSION_LINK,
      closesAt: CLOSES_AT,
    });

    const actions = message.blocks.filter(block => block.type === 'actions');
    expect(actions).toHaveLength(2);
    expect((actions[0].elements as unknown[])).toHaveLength(5);
  });

  it('names the outstanding questions and no others', () => {
    const message = buildClosingReminderMessage({
      questions: QUESTIONS,
      sessionLinkUrl: SESSION_LINK,
      closesAt: CLOSES_AT,
    });
    const serialised = textOf(message);

    expect(serialised).toContain('Ease of Delivery');
    expect(serialised).toContain('Learning and Improving');
    expect(serialised).not.toContain('Psychological Safety');
  });

  it('includes the session link so the member can respond in the browser', () => {
    const message = buildClosingReminderMessage({
      questions: QUESTIONS,
      sessionLinkUrl: SESSION_LINK,
      closesAt: CLOSES_AT,
    });

    expect(textOf(message)).toContain(SESSION_LINK);
  });

  it('still reminds when every question is somehow already answered', () => {
    const message = buildClosingReminderMessage({
      questions: [],
      sessionLinkUrl: SESSION_LINK,
      closesAt: CLOSES_AT,
    });

    expect(message.blocks.length).toBeGreaterThan(0);
    expect(textOf(message)).toContain(SESSION_LINK);
  });
});
