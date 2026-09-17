/**
 * Reading a Slack user's email, and what happens when it cannot be read.
 *
 * Requirements: Slack Sign In 3.1, 3.5
 *
 * The interesting behaviour is the failure, not the success. A guest account,
 * a missing scope and a Slack outage all have to look the same to the caller —
 * absent, not broken — so that sign-in falls back to the manager-asserted path
 * rather than returning a 500 to somebody typing a slash command.
 *
 * Against a stubbed `fetch` rather than a stubbed client: the request shape and
 * the response parsing are the whole of this module, and a stubbed client would
 * test neither.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createRecorder } from '@/lib/observability';
import { createSlackUserDirectory } from './user-directory';

const TOKEN = 'xoxb-test-token';

let events: Record<string, unknown>[];
let recorder: ReturnType<typeof createRecorder>;

beforeEach(() => {
  events = [];
  recorder = createRecorder({
    sink: { write: line => events.push(JSON.parse(line) as Record<string, unknown>) },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Stubs `fetch` with one canned response and records what it was called with. */
function stubFetch(response: unknown, init: { ok?: boolean; status?: number } = {}) {
  const calls: Array<{ url: string; headers: Record<string, string> }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, options?: { headers?: Record<string, string> }) => {
      calls.push({ url, headers: options?.headers ?? {} });
      return {
        ok: init.ok ?? true,
        status: init.status ?? 200,
        json: async () => response,
      };
    }),
  );
  return calls;
}

describe('an email Slack will give us', () => {
  it('is returned', async () => {
    stubFetch({ ok: true, user: { profile: { email: 'alice@example.invalid' } } });

    const email = await createSlackUserDirectory(TOKEN, recorder).emailFor('U_ALICE');

    expect(email).toBe('alice@example.invalid');
  });

  it('is asked for by user id, authenticated as the bot', async () => {
    // The request shape is half of what this module does, and a stubbed client
    // would have proved nothing about it
    const calls = stubFetch({ ok: true, user: { profile: { email: 'a@b.invalid' } } });

    await createSlackUserDirectory(TOKEN, recorder).emailFor('U_ALICE');

    expect(calls[0].url).toContain('users.info');
    expect(calls[0].url).toContain('user=U_ALICE');
    expect(calls[0].headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('escapes the user id rather than pasting it into a URL', async () => {
    const calls = stubFetch({ ok: true, user: { profile: { email: 'a@b.invalid' } } });

    await createSlackUserDirectory(TOKEN, recorder).emailFor('U ALICE&x=1');

    expect(calls[0].url).not.toContain('&x=1');
  });

  it('says nothing to the log, because this is the ordinary case', async () => {
    stubFetch({ ok: true, user: { profile: { email: 'alice@example.invalid' } } });

    await createSlackUserDirectory(TOKEN, recorder).emailFor('U_ALICE');

    expect(events).toEqual([]);
  });
});

describe('an email Slack will not give us', () => {
  it('is absent when the profile carries none', async () => {
    // A guest or a bot. Ordinary, not a fault
    stubFetch({ ok: true, user: { profile: {} } });

    await expect(createSlackUserDirectory(TOKEN, recorder).emailFor('U_GUEST')).resolves.toBeNull();
  });

  it('is absent, and unrecorded, for a profile with no email', async () => {
    /*
     * Recording this would put a line in the log every time somebody outside
     * the team tried the command — which is how a log stops being read.
     */
    stubFetch({ ok: true, user: { profile: {} } });

    await createSlackUserDirectory(TOKEN, recorder).emailFor('U_GUEST');

    expect(events).toEqual([]);
  });

  it('is absent when the scope is missing, and says which error it was', async () => {
    /*
     * The record is what stops a permanently missing scope looking like a
     * workspace full of guests: `missing_scope` is visible to somebody reading
     * the log rather than inferred from members who cannot sign in.
     */
    stubFetch({ ok: false, error: 'missing_scope' });

    const email = await createSlackUserDirectory(TOKEN, recorder).emailFor('U_ALICE');

    expect(email).toBeNull();
    expect(events[0]).toMatchObject({ event: 'slack.email.unavailable', level: 'error' });
    expect(events[0].reason).toBe('missing_scope');
  });

  it('is absent when Slack answers with an HTTP error', async () => {
    stubFetch({}, { ok: false, status: 503 });

    const email = await createSlackUserDirectory(TOKEN, recorder).emailFor('U_ALICE');

    expect(email).toBeNull();
    expect(events[0].reason).toBe('HTTP 503');
  });

  it('is absent when the network fails, rather than throwing at the caller', async () => {
    /*
     * A slash command has three seconds to answer. An exception escaping here
     * would turn a Slack outage into an error message for somebody who only
     * wanted to sign in.
     */
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNRESET'); }));

    const email = await createSlackUserDirectory(TOKEN, recorder).emailFor('U_ALICE');

    expect(email).toBeNull();
    expect(events[0].reason).toContain('ECONNRESET');
  });

  it('never puts the address in the record', async () => {
    // The same rule the rest of the observability code follows: ids, not
    // addresses. This one reads addresses, so it is worth asserting
    stubFetch({ ok: false, error: 'user_not_found' });

    await createSlackUserDirectory(TOKEN, recorder).emailFor('U_ALICE');

    expect(JSON.stringify(events)).not.toContain('@');
  });
});
