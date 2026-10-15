/**
 * An unmocked request is refused by MSW rather than sent.
 *
 * Requirements: Integration 12.5, 12.6
 *
 * This asserts a property of the harness itself, which is unusual, and it is
 * here because the harness has lied before. AGENTS.md records an MSW handler
 * that required a body field the real route ignored: the mock drifted from the
 * contract it imitated and every UI test stayed green.
 *
 * `server.listen({ onUnhandledFrame: 'error' })` in `setup-node.ts` is what
 * stops the next drift being silent. Without it an unmocked call is a warning
 * in a log nobody reads, and a test that quietly talks to the real network
 * passes or fails on whether the network is up.
 *
 * msw 3 renamed that option from `onUnhandledRequest`. A rename type-checks
 * whether or not the new key is the one the library reads, so the only way to
 * know the guard survived the upgrade is to trip it.
 *
 * **It asserts the cause, not merely that something threw.** The first version
 * of this test fetched `https://unhandled.invalid/`, which rejects because a
 * reserved TLD never resolves — so it passed with the guard deliberately
 * removed and proved nothing at all. The host here is one that does resolve,
 * and the assertion names MSW's own refusal, so a lost guard fails this test
 * whether the request then succeeds or the network is simply unavailable.
 */

import { describe, it, expect } from 'vitest';

/** Resolvable, and handled by nothing in src/tests/mocks. */
const UNHANDLED = 'https://example.com/definitely-not-mocked';

describe('a request with no handler', () => {
  it('is refused by MSW rather than sent', async () => {
    const error = await fetch(UNHANDLED).then(
      () => null,
      (reason: unknown) => reason,
    );

    expect(error, 'the request was sent instead of being refused').not.toBeNull();

    const cause = (error as Error & { cause?: unknown }).cause;
    expect(String(cause)).toContain('[MSW]');
    expect(String(cause)).toContain('onUnhandledFrame');
  });
});
