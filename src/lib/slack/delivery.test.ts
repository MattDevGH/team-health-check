import { describe, it, expect, vi } from 'vitest';
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
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

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
    });

    expect(result).toEqual<DeliveryResult>({
      success: false,
      attempts: 3,
      error: 'channel_not_found',
    });
    expect(client.postMessage).toHaveBeenCalledTimes(3);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Slack delivery failed after 3 attempts')
    );

    consoleErrorSpy.mockRestore();
  });

  it('fails after all retries exhausted with network errors', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

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
    });

    expect(result).toEqual<DeliveryResult>({
      success: false,
      attempts: 3,
      error: 'timeout',
    });
    expect(client.postMessage).toHaveBeenCalledTimes(3);

    consoleErrorSpy.mockRestore();
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
