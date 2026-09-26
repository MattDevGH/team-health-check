/**
 * Tests for replaying queued Slack deliveries.
 *
 * Requirements: Original 5.12, 5.13; Integration 8.5
 */

import { describe, it, expect, vi } from 'vitest';

import { createQueuedDeliveryDispatcher } from './queue-drain';
import { encodeQueuedDelivery } from './queued-delivery';
import type { SlackApiClient } from './delivery';
import type { InteractionResponder } from './interaction-response';
import type { ScoreActionDeps } from './score-actions';

const RESPONSE_URL = 'https://hooks.slack.com/actions/T1/1/x';

/**
 * Score-action dependencies that succeed, recording what was stored.
 *
 * Requirements: NFR 1.2
 */
function scoreActionDeps(overrides: Partial<ScoreActionDeps> = {}) {
  const stored: Array<{ questionId: string; score: number }> = [];

  const deps: ScoreActionDeps = {
    findMemberBySlackUserId: async () => 'member-1',
    findOpenSessionForMember: async () => 'session-1',
    questionTitle: async id => id,
    upsertResponse: async ({ questionId, score }) => {
      stored.push({ questionId, score });
    },
    ...overrides,
  };

  return { deps, stored };
}

function build(overrides: {
  postMessage?: SlackApiClient['postMessage'];
  respond?: InteractionResponder['respond'];
  scoreActions?: Partial<ScoreActionDeps>;
} = {}) {
  const postMessage = vi.fn(overrides.postMessage ?? (async () => ({ ok: true })));
  const respond = vi.fn(overrides.respond ?? (async () => true));
  const { deps: scoreActions, stored } = scoreActionDeps(overrides.scoreActions);

  const dispatch = createQueuedDeliveryDispatcher({
    slackClient: { postMessage },
    responder: { respond },
    scoreActions,
  });

  return { dispatch, postMessage, respond, stored };
}

/**
 * Requirements: NFR 1.2; Slack Sign In NFR 1.1
 *
 * The interaction route writes the score buttons down and acknowledges before
 * applying them, because unawaited work in a serverless function may stop when
 * the response is flushed. If the instance dies in between, these entries are
 * what a later tick finds.
 */
describe('score buttons that were accepted but not applied', () => {
  function queued(overrides: Record<string, unknown> = {}) {
    return encodeQueuedDelivery({
      kind: 'score_actions',
      slackUserId: 'U_SLACK_1',
      actions: [{ actionId: 'score_q-delivering-value', value: 'q-delivering-value:4' }],
      responseUrl: RESPONSE_URL,
      ...overrides,
    } as Parameters<typeof encodeQueuedDelivery>[0]);
  }

  it('applies the scores', async () => {
    const { dispatch, stored } = build();

    await expect(dispatch('', queued())).resolves.toBe(true);
    expect(stored).toEqual([{ questionId: 'q-delivering-value', score: 4 }]);
  });

  it('tells the member what was stored', async () => {
    const { dispatch, respond } = build();

    await dispatch('', queued());

    expect(respond).toHaveBeenCalledOnce();
    expect(respond.mock.calls[0]?.[0]).toBe(RESPONSE_URL);
  });

  /**
   * Applying is the delivery; the reply is a courtesy on top. Retrying would
   * re-apply answers the member already gave in order to tell them something
   * they may no longer be waiting for.
   */
  it('counts as delivered even when the member cannot be told', async () => {
    const { dispatch, stored } = build({ respond: async () => false });

    await expect(dispatch('', queued())).resolves.toBe(true);
    expect(stored).toHaveLength(1);
  });

  it('still applies when Slack gave no response_url to reply to', async () => {
    const { dispatch, stored, respond } = build();

    await expect(dispatch('', queued({ responseUrl: undefined }))).resolves.toBe(true);
    expect(stored).toHaveLength(1);
    expect(respond).not.toHaveBeenCalled();
  });

  it('does not reply when there was nothing worth saying', async () => {
    // No score buttons in the payload, so nothing was stored and nothing is owed
    const { dispatch, respond } = build();

    await dispatch('', queued({ actions: [{ actionId: 'open_dashboard', value: 'x' }] }));

    expect(respond).not.toHaveBeenCalled();
  });

  it('reports failure when the database is unreachable, so the tick retries', async () => {
    const { dispatch } = build({
      scoreActions: {
        findMemberBySlackUserId: async () => {
          throw new Error('database down');
        },
      },
    });

    // A throw here must not abort the whole drain
    await expect(dispatch('', queued())).rejects.toThrow();
  });
});

describe('createQueuedDeliveryDispatcher', () => {
  it('replays a direct message to the stored Slack user', async () => {
    const { dispatch, postMessage } = build();
    const blocks = [{ type: 'section' }];
    const payload = encodeQueuedDelivery({
      kind: 'dm',
      memberId: 'member-1',
      slackUserId: 'U_SLACK_1',
      blocks,
    });

    await expect(dispatch('', payload)).resolves.toBe(true);
    expect(postMessage).toHaveBeenCalledWith({ channel: 'U_SLACK_1', blocks });
  });

  it('reports failure when Slack rejects the replayed direct message', async () => {
    const { dispatch } = build({
      postMessage: async () => ({ ok: false, error: 'channel_not_found' }),
    });
    const payload = encodeQueuedDelivery({
      kind: 'dm',
      memberId: 'member-1',
      slackUserId: 'U_SLACK_1',
      blocks: [],
    });

    await expect(dispatch('', payload)).resolves.toBe(false);
  });

  it('replays a response_url reply through the responder', async () => {
    const { dispatch, respond } = build();
    const payload = encodeQueuedDelivery({
      kind: 'response_url',
      responseUrl: RESPONSE_URL,
      text: 'Recorded 4',
    });

    await expect(dispatch(RESPONSE_URL, payload)).resolves.toBe(true);
    expect(respond).toHaveBeenCalledWith(RESPONSE_URL, 'Recorded 4');
  });

  it('reports failure when the responder cannot deliver', async () => {
    const { dispatch } = build({ respond: async () => false });
    const payload = encodeQueuedDelivery({
      kind: 'response_url',
      responseUrl: RESPONSE_URL,
      text: 'Recorded 4',
    });

    await expect(dispatch(RESPONSE_URL, payload)).resolves.toBe(false);
  });

  it('reports failure for an unreadable entry without throwing', async () => {
    const { dispatch, postMessage, respond } = build();

    await expect(dispatch('', 'not json')).resolves.toBe(false);
    expect(postMessage).not.toHaveBeenCalled();
    expect(respond).not.toHaveBeenCalled();
  });

  it('reports failure for a direct message when no Slack client is configured', async () => {
    const dispatch = createQueuedDeliveryDispatcher({
      responder: { async respond() { return true; } },
      scoreActions: scoreActionDeps().deps,
    });
    const payload = encodeQueuedDelivery({
      kind: 'dm',
      memberId: 'member-1',
      slackUserId: 'U_SLACK_1',
      blocks: [],
    });

    await expect(dispatch('', payload)).resolves.toBe(false);
  });
});
