import { describe, it, expect, vi } from 'vitest';
import { createRecorder } from '@/lib/observability';
import { deliverSlackMessage, type SlackApiClient, type DeliveryResult } from './delivery';

function createMockSlackClient(responses: Array<{ ok: boolean; error?: string } | Error>): SlackApiClient {
  let callIndex = 0;
  return {
    postMessage: vi.fn(async () => {
      const response = responses[callIndex++];
      if (response instanceof Error) {
        throw response;
      }
      return response;
    }),
  };
}

/**
 * Reads what was recorded.
 *
 * These tests spied on `console.error` and asserted a string had been passed to
 * it — which proves a call happened, not that anything useful was written. The
 * line it checked said "Slack delivery failed after 3 attempts" with no member,
 * team or channel in it.
 */
function capturingRecorder() {
  const events: Record<string, unknown>[] = [];
  return {
    events,
    recorder: createRecorder({
      sink: { write: line => events.push(JSON.parse(line) as Record<string, unknown>) },
    }),
  };
}
describe('deliverSlackMessage', () => {
  it('succeeds on first attempt when API returns ok', async () => {
    const client = createMockSlackClient([{ ok: true }]);

    const result = await deliverSlackMessage({
      slackClient: client,
      slackUserId: 'U12345',
      blocks: [{ type: 'section', text: { type: 'mrkdwn', text: 'Hello' } }],
    });

    expect(result).toEqual<DeliveryResult>({ success: true, attempts: 1 });
    expect(client.postMessage).toHaveBeenCalledTimes(1);
    expect(client.postMessage).toHaveBeenCalledWith({
      channel: 'U12345',
      blocks: [{ type: 'section', text: { type: 'mrkdwn', text: 'Hello' } }],
    });
  });

  it('retries and succeeds after transient failure', async () => {
    const client = createMockSlackClient([
      { ok: false, error: 'rate_limited' },
      { ok: true },
    ]);

    const result = await deliverSlackMessage({
      slackClient: client,
      slackUserId: 'U12345',
      blocks: [],
      retryDelayMs: 0, // Speed up tests
    });

    expect(result).toEqual<DeliveryResult>({ success: true, attempts: 2 });
    expect(client.postMessage).toHaveBeenCalledTimes(2);
  });

  it('retries and succeeds after network error', async () => {
    const client = createMockSlackClient([
      new Error('ECONNRESET'),
      { ok: true },
    ]);

    const result = await deliverSlackMessage({
      slackClient: client,
      slackUserId: 'U12345',
      blocks: [],
      retryDelayMs: 0,
    });

    expect(result).toEqual<DeliveryResult>({ success: true, attempts: 2 });
    expect(client.postMessage).toHaveBeenCalledTimes(2);
  });

  it('fails after all retries are exhausted', async () => {
    /*
     * This asserted that `console.error` had been called with a string. That
     * proves a call was made, not that anything useful was written — and the
     * line it checked said `Slack delivery failed after 3 attempts` with no
     * member, team or channel in it.
     */
    const written = capturingRecorder();

    const client = createMockSlackClient([
      { ok: false, error: 'channel_not_found' },
      { ok: false, error: 'channel_not_found' },
      { ok: false, error: 'channel_not_found' },
    ]);

    const result = await deliverSlackMessage({
      slackClient: client,
      slackUserId: 'U12345',
      blocks: [],
      retryDelayMs: 0,
      recorder: written.recorder,
    });

    expect(result).toEqual<DeliveryResult>({
      success: false,
      attempts: 3,
      error: 'channel_not_found',
    });
    expect(client.postMessage).toHaveBeenCalledTimes(3);

    // What the record says, which is what somebody debugging would read
    expect(written.events[0]).toMatchObject({
      event: 'slack.delivery.exhausted',
      channel: 'U12345',
      attempts: 3,
      message: 'channel_not_found',
    });
  });

  it('fails after all retries exhausted with network errors', async () => {
    const written = capturingRecorder();

    const client = createMockSlackClient([
      new Error('timeout'),
      new Error('timeout'),
      new Error('timeout'),
    ]);

    const result = await deliverSlackMessage({
      slackClient: client,
      slackUserId: 'U12345',
      blocks: [],
      retryDelayMs: 0,
      recorder: written.recorder,
    });

    expect(result).toEqual<DeliveryResult>({
      success: false,
      attempts: 3,
      error: 'timeout',
    });
    expect(client.postMessage).toHaveBeenCalledTimes(3);
    expect(written.events[0]).toMatchObject({ message: 'timeout', attempts: 3 });
  });

  it('returns correct attempt count on second-attempt success', async () => {
    const client = createMockSlackClient([
      new Error('ECONNREFUSED'),
      { ok: true },
    ]);

    const result = await deliverSlackMessage({
      slackClient: client,
      slackUserId: 'U12345',
      blocks: [],
      retryDelayMs: 0,
    });

    expect(result.attempts).toBe(2);
    expect(result.success).toBe(true);
  });

  it('returns correct attempt count on third-attempt success', async () => {
    const client = createMockSlackClient([
      { ok: false, error: 'rate_limited' },
      new Error('timeout'),
      { ok: true },
    ]);

    const result = await deliverSlackMessage({
      slackClient: client,
      slackUserId: 'U12345',
      blocks: [],
      retryDelayMs: 0,
    });

    expect(result.attempts).toBe(3);
    expect(result.success).toBe(true);
  });

  it('handles unknown error type in catch block', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const client: SlackApiClient = {
      postMessage: vi.fn(async () => {
        throw 'string error'; // Non-Error thrown
      }),
    };

    const result = await deliverSlackMessage({
      slackClient: client,
      slackUserId: 'U12345',
      blocks: [],
      retryDelayMs: 0,
    });

    expect(result).toEqual<DeliveryResult>({
      success: false,
      attempts: 3,
      error: 'Network error',
    });

    consoleErrorSpy.mockRestore();
  });

  it('defaults to 5000ms retry delay', async () => {
    const client = createMockSlackClient([
      { ok: false, error: 'rate_limited' },
      { ok: true },
    ]);

    const start = Date.now();
    const result = await deliverSlackMessage({
      slackClient: client,
      slackUserId: 'U12345',
      blocks: [],
      // No retryDelayMs — uses default 5000ms
    });

    const elapsed = Date.now() - start;

    expect(result.success).toBe(true);
    // Should have waited at least ~5000ms (with some tolerance for CI slowness)
    expect(elapsed).toBeGreaterThanOrEqual(4900);
  }, 10000);
});
