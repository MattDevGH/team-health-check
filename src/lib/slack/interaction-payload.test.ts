/**
 * Decoding a Slack interaction payload.
 *
 * Requirements: Slack Sign In NFR 1.5, NFR 1.6
 *
 * The route used to do this:
 *
 *     const payload: SlackInteractionPayload = JSON.parse(payloadStr);
 *
 * `JSON.parse` returns `any`, so the annotation is a claim rather than a
 * check — the compiler agrees and nothing is verified. A malformed body threw
 * out of the route instead of being refused, and every field was trusted.
 *
 * These assert what comes back, not that a parser was called.
 */

import { describe, it, expect } from 'vitest';

import { decodeInteractionPayload, parseScoreAction } from './interaction-payload';

/** The shape Slack actually sends for a block_actions score click. */
function scoreClick(): string {
  return JSON.stringify({
    type: 'block_actions',
    user: { id: 'U123', name: 'alice' },
    response_url: 'https://hooks.slack.com/actions/T1/B2/abc',
    actions: [{ action_id: 'score_q-delivering-value', value: 'q-delivering-value:4', type: 'button' }],
  });
}

describe('decodeInteractionPayload', () => {
  it('reads a real block_actions payload', () => {
    const payload = decodeInteractionPayload(scoreClick());

    expect(payload).not.toBeNull();
    expect(payload?.type).toBe('block_actions');
    expect(payload?.user?.id).toBe('U123');
    expect(payload?.actions).toHaveLength(1);
    expect(payload?.actions?.[0]?.value).toBe('q-delivering-value:4');
    expect(payload?.responseUrl).toBe('https://hooks.slack.com/actions/T1/B2/abc');
  });

  it('refuses a body that is not JSON at all', () => {
    // This threw out of the route before, rather than being refused
    expect(decodeInteractionPayload('not json {')).toBeNull();
  });

  it('refuses JSON that is not an object', () => {
    expect(decodeInteractionPayload('"a string"')).toBeNull();
    expect(decodeInteractionPayload('42')).toBeNull();
    expect(decodeInteractionPayload('null')).toBeNull();
    expect(decodeInteractionPayload('[]')).toBeNull();
  });

  it('refuses a payload with no type', () => {
    expect(decodeInteractionPayload(JSON.stringify({ user: { id: 'U1' } }))).toBeNull();
  });

  it('drops a user whose id is not a string rather than trusting it', () => {
    const payload = decodeInteractionPayload(
      JSON.stringify({ type: 'block_actions', user: { id: 42 } }),
    );

    // An identity claim that is not a string is not an identity claim
    expect(payload).not.toBeNull();
    expect(payload?.user).toBeUndefined();
  });

  it('drops actions that are not shaped like actions', () => {
    const payload = decodeInteractionPayload(
      JSON.stringify({
        type: 'block_actions',
        actions: ['not an object', 42, { action_id: 'score_q1', value: 'q1:3' }],
      }),
    );

    expect(payload?.actions).toHaveLength(1);
    expect(payload?.actions?.[0]?.actionId).toBe('score_q1');
  });

  it('drops a response_url that is not a string', () => {
    const payload = decodeInteractionPayload(
      JSON.stringify({ type: 'block_actions', response_url: { href: 'https://evil' } }),
    );

    expect(payload?.responseUrl).toBeUndefined();
  });

  it('accepts a payload with no actions, which is a payload with nothing to do', () => {
    const payload = decodeInteractionPayload(JSON.stringify({ type: 'view_submission' }));

    expect(payload?.type).toBe('view_submission');
    expect(payload?.actions).toBeUndefined();
  });
});

describe('parseScoreAction', () => {
  it('reads the value the application emitted', () => {
    expect(parseScoreAction('q-delivering-value:4')).toEqual({
      questionId: 'q-delivering-value',
      score: 4,
    });
  });

  it.each(['1', '2', '3', '4', '5'])('accepts a score of %s', score => {
    expect(parseScoreAction(`q-1:${score}`)?.score).toBe(Number(score));
  });

  /**
   * Requirement NFR 1.6. `parseInt` reads "3abc" as 3 and "4.9" as 4, so a
   * value the application never emitted was accepted as though it had been.
   */
  it.each(['q-1:3abc', 'q-1:4.9', 'q-1: 3', 'q-1:+3', 'q-1:0x3', 'q-1:03'])(
    'refuses %s, which is not a value this application emits',
    value => {
      expect(parseScoreAction(value)).toBeNull();
    },
  );

  it.each(['q-1:0', 'q-1:6', 'q-1:-1'])('refuses the out-of-range score in %s', value => {
    expect(parseScoreAction(value)).toBeNull();
  });

  it('refuses a value with no separator', () => {
    expect(parseScoreAction('q-delivering-value')).toBeNull();
  });

  it('refuses a value with no question id', () => {
    expect(parseScoreAction(':4')).toBeNull();
  });

  it('keeps a question id containing a colon intact', () => {
    // The split is on the last colon, because ids are ours and scores are not
    expect(parseScoreAction('q:odd:id:2')).toEqual({ questionId: 'q:odd:id', score: 2 });
  });
});
