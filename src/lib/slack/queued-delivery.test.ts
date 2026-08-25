/**
 * Tests for the replayable descriptor stored on queued Slack deliveries.
 *
 * A queued entry is replayed by a later scheduler tick in a different process,
 * so it must carry its own destination rather than relying on state that only
 * existed during the original request.
 *
 * Requirements: Original 5.13; Integration 8.5
 */

import { describe, it, expect } from 'vitest';

import { decodeQueuedDelivery, encodeQueuedDelivery } from './queued-delivery';
import type { QueuedDelivery } from './queued-delivery';

describe('queued delivery encoding', () => {
  it('round-trips a direct-message delivery', () => {
    const delivery: QueuedDelivery = {
      kind: 'dm',
      memberId: 'member-1',
      slackUserId: 'U_SLACK_1',
      blocks: [{ type: 'section', text: { type: 'mrkdwn', text: 'hi' } }],
    };

    expect(decodeQueuedDelivery(encodeQueuedDelivery(delivery))).toEqual(delivery);
  });

  it('round-trips a response_url delivery', () => {
    const delivery: QueuedDelivery = {
      kind: 'response_url',
      responseUrl: 'https://hooks.slack.com/actions/T1/1/x',
      text: 'Recorded 4',
    };

    expect(decodeQueuedDelivery(encodeQueuedDelivery(delivery))).toEqual(delivery);
  });

  it('keeps the member id discoverable for tracing', () => {
    const encoded = encodeQueuedDelivery({
      kind: 'dm',
      memberId: 'member-42',
      slackUserId: 'U9',
      blocks: [],
    });

    expect(encoded).toContain('member-42');
  });

  it('rejects malformed JSON rather than throwing', () => {
    expect(decodeQueuedDelivery('not json')).toBeNull();
  });

  it('rejects a payload with an unknown kind', () => {
    expect(decodeQueuedDelivery(JSON.stringify({ kind: 'carrier-pigeon' }))).toBeNull();
  });

  it('rejects a payload missing required fields', () => {
    expect(decodeQueuedDelivery(JSON.stringify({ kind: 'dm', memberId: 'm' }))).toBeNull();
    expect(decodeQueuedDelivery(JSON.stringify({ kind: 'response_url' }))).toBeNull();
  });
});
