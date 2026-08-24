/**
 * Tests for the Slack interaction response sender.
 *
 * Slack gives each interaction a one-off `response_url`; replying to it is the
 * only way to update or follow up an ephemeral message.
 *
 * Requirements: Original 5.7, 5.8, 5.9
 */

import { describe, it, expect, vi } from 'vitest';

import { createInteractionResponder } from './interaction-response';

const RESPONSE_URL = 'https://hooks.slack.com/actions/T123/456/response';

function okFetch() {
  return vi.fn(async () => new Response(null, { status: 200 }));
}

describe('createInteractionResponder', () => {
  it('posts an ephemeral message to the response url', async () => {
    const fetchImpl = okFetch();
    const responder = createInteractionResponder({ fetchImpl });

    await expect(responder.respond(RESPONSE_URL, 'Recorded 4')).resolves.toBe(true);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(RESPONSE_URL);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      response_type: 'ephemeral',
      replace_original: false,
      text: 'Recorded 4',
    });
  });

  it('sends JSON content type', async () => {
    const fetchImpl = okFetch();

    await createInteractionResponder({ fetchImpl }).respond(RESPONSE_URL, 'hi');

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' });
  });

  it('reports failure on a non-2xx response without throwing', async () => {
    const fetchImpl = vi.fn(async () => new Response('expired', { status: 404 }));

    await expect(
      createInteractionResponder({ fetchImpl }).respond(RESPONSE_URL, 'hi'),
    ).resolves.toBe(false);
  });

  it('reports failure on a network error without throwing', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNRESET');
    });

    await expect(
      createInteractionResponder({ fetchImpl }).respond(RESPONSE_URL, 'hi'),
    ).resolves.toBe(false);
  });
});
