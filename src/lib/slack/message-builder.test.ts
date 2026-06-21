import { describe, it, expect } from 'vitest';
import { buildPromptMessage } from './message-builder';
import type { Question } from '@/lib/repositories/entities';

const SAMPLE_QUESTIONS: Question[] = [
  { id: 'q-delivering-value', title: 'Delivering Value', description: 'How well is the team delivering value to stakeholders?', displayOrder: 1 },
  { id: 'q-team-collaboration', title: 'Team Collaboration', description: 'How effectively does the team work together?', displayOrder: 2 },
  { id: 'q-ease-of-delivery', title: 'Ease of Delivery', description: 'How easy is it to get work done?', displayOrder: 3 },
];

const SESSION_LINK_URL = 'https://example.com/session/abc123';

describe('buildPromptMessage', () => {
  it('contains a header section', () => {
    const message = buildPromptMessage({
      questions: SAMPLE_QUESTIONS,
      sessionLinkUrl: SESSION_LINK_URL,
    });

    const headerBlock = message.blocks[0];
    expect(headerBlock.type).toBe('section');
    expect((headerBlock.text as { text: string }).text).toContain('Health Check');
  });

  it('contains one section and one actions block per question', () => {
    const message = buildPromptMessage({
      questions: SAMPLE_QUESTIONS,
      sessionLinkUrl: SESSION_LINK_URL,
    });

    // Header (1) + per-question (section + actions = 2 each) + context (1)
    // 1 + (3 * 2) + 1 = 8
    expect(message.blocks).toHaveLength(8);

    const sectionBlocks = message.blocks.filter(
      (b, i) => b.type === 'section' && i > 0
    );
    expect(sectionBlocks).toHaveLength(3);

    const actionBlocks = message.blocks.filter(b => b.type === 'actions');
    expect(actionBlocks).toHaveLength(3);
  });

  it('each question section displays the title and description', () => {
    const message = buildPromptMessage({
      questions: SAMPLE_QUESTIONS,
      sessionLinkUrl: SESSION_LINK_URL,
    });

    // First question section is at index 1
    const firstQuestionSection = message.blocks[1];
    const text = (firstQuestionSection.text as { text: string }).text;
    expect(text).toContain('Delivering Value');
    expect(text).toContain('How well is the team delivering value to stakeholders?');
  });

  it('each question has 5 score buttons (1-5)', () => {
    const message = buildPromptMessage({
      questions: SAMPLE_QUESTIONS,
      sessionLinkUrl: SESSION_LINK_URL,
    });

    const actionBlocks = message.blocks.filter(b => b.type === 'actions');

    for (const actionBlock of actionBlocks) {
      const elements = actionBlock.elements as Array<{
        type: string;
        text: { type: string; text: string };
        value: string;
        action_id: string;
      }>;
      expect(elements).toHaveLength(5);

      for (let i = 0; i < 5; i++) {
        expect(elements[i].type).toBe('button');
        expect(elements[i].text.type).toBe('plain_text');
        expect(elements[i].text.text).toBe(String(i + 1));
      }
    }
  });

  it('buttons have correct values in questionId:score format', () => {
    const message = buildPromptMessage({
      questions: SAMPLE_QUESTIONS,
      sessionLinkUrl: SESSION_LINK_URL,
    });

    // First actions block (index 2) corresponds to first question
    const firstActionBlock = message.blocks[2];
    const elements = firstActionBlock.elements as Array<{ value: string; action_id: string }>;

    expect(elements[0].value).toBe('q-delivering-value:1');
    expect(elements[1].value).toBe('q-delivering-value:2');
    expect(elements[2].value).toBe('q-delivering-value:3');
    expect(elements[3].value).toBe('q-delivering-value:4');
    expect(elements[4].value).toBe('q-delivering-value:5');
  });

  it('buttons have unique action_ids per question and score', () => {
    const message = buildPromptMessage({
      questions: SAMPLE_QUESTIONS,
      sessionLinkUrl: SESSION_LINK_URL,
    });

    const actionBlocks = message.blocks.filter(b => b.type === 'actions');
    const allActionIds: string[] = [];

    for (const actionBlock of actionBlocks) {
      const elements = actionBlock.elements as Array<{ action_id: string }>;
      for (const el of elements) {
        allActionIds.push(el.action_id);
      }
    }

    // All action IDs should be unique
    expect(new Set(allActionIds).size).toBe(allActionIds.length);

    // Action IDs follow the pattern score_{questionId}_{score}
    expect(allActionIds[0]).toBe('score_q-delivering-value_1');
  });

  it('actions blocks have block_id with question identifier', () => {
    const message = buildPromptMessage({
      questions: SAMPLE_QUESTIONS,
      sessionLinkUrl: SESSION_LINK_URL,
    });

    const actionBlocks = message.blocks.filter(b => b.type === 'actions');
    expect(actionBlocks[0].block_id).toBe('score_q-delivering-value');
    expect(actionBlocks[1].block_id).toBe('score_q-team-collaboration');
    expect(actionBlocks[2].block_id).toBe('score_q-ease-of-delivery');
  });

  it('includes session link URL in context block as fallback', () => {
    const message = buildPromptMessage({
      questions: SAMPLE_QUESTIONS,
      sessionLinkUrl: SESSION_LINK_URL,
    });

    const lastBlock = message.blocks[message.blocks.length - 1];
    expect(lastBlock.type).toBe('context');

    const elements = lastBlock.elements as Array<{ type: string; text: string }>;
    expect(elements).toHaveLength(1);
    expect(elements[0].type).toBe('mrkdwn');
    expect(elements[0].text).toContain(SESSION_LINK_URL);
    expect(elements[0].text).toContain('browser');
  });

  it('works with a single question', () => {
    const message = buildPromptMessage({
      questions: [SAMPLE_QUESTIONS[0]],
      sessionLinkUrl: SESSION_LINK_URL,
    });

    // Header (1) + question section (1) + actions (1) + context (1) = 4
    expect(message.blocks).toHaveLength(4);
  });

  it('works with an empty questions array', () => {
    const message = buildPromptMessage({
      questions: [],
      sessionLinkUrl: SESSION_LINK_URL,
    });

    // Header (1) + context (1) = 2
    expect(message.blocks).toHaveLength(2);
  });
});
