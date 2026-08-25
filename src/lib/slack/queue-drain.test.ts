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

const RESPONSE_URL = 'https://hooks.slack.com/actions/T1/1/x';

function build(overrides: {
  postMessage?: SlackApiClient['postMessage'];
  respond?: InteractionResponder['respond'];
} = {}) {
  const postMessage = vi.fn(overrides.postMessage ?? (async () => ({ ok: true })));
  const respond = vi.fn(overrides.respond ?? (async () => true));

  const dispatch = createQueuedDeliveryDispatcher({
    slackClient: { postMessage },
    responder: { respond },
  });

  return { dispatch, postMessage, respond };
}

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
