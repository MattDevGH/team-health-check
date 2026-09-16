/**
 * An unexpected error says which route it came from.
 *
 * Requirements: Knowing What Happened 2.1, 2.2
 *
 * The central handler wrote `Unexpected error:` and the error object. In a
 * serverless log that line arrives with no request beside it, so the one thing
 * a reader needs — which route — was the one thing missing.
 */

import { describe, expect, it } from 'vitest';

import { withErrorHandling } from '@/lib/api-utils';
import { createRecorder } from '@/lib/observability';

function harness() {
  const events: Record<string, unknown>[] = [];
  return {
    events,
    recorder: createRecorder({
      sink: { write: line => events.push(JSON.parse(line) as Record<string, unknown>) },
    }),
  };
}

const request = (url: string) => new Request(url, { method: 'GET' });
const context = { params: Promise.resolve({}) };

describe('an unexpected error', () => {
  it('records the route it came from', async () => {
    const { events, recorder } = harness();
    const handler = withErrorHandling(async () => {
      throw new Error('something gave way');
    }, recorder);

    await handler(request('http://localhost/api/teams/team-1/trends'), context);

    expect(events[0]).toMatchObject({
      event: 'request.failed',
      route: '/api/teams/team-1/trends',
      level: 'error',
    });
  });

  it('records what went wrong', async () => {
    const { events, recorder } = harness();
    const handler = withErrorHandling(async () => {
      throw new Error('something gave way');
    }, recorder);

    await handler(request('http://localhost/api/me'), context);

    expect(events[0].message).toContain('something gave way');
    expect(events[0].errorName).toBe('Error');
  });

  it('still answers the caller with nothing revealing', async () => {
    // The record is for the maintainer; the response stays as it was
    const { recorder } = harness();
    const handler = withErrorHandling(async () => {
      throw new Error('connection string rejected');
    }, recorder);

    const response = await handler(request('http://localhost/api/me'), context);
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(body).not.toContain('connection string');
  });

  it('records nothing for an error the application meant to produce', async () => {
    /*
     * A 404 or a validation failure is the system working. Recording those
     * would bury the ones that matter in the ones that do not.
     */
    const { events, recorder } = harness();
    const { NotFoundError } = await import('@/lib/errors');
    const handler = withErrorHandling(async () => {
      throw new NotFoundError('Team not found');
    }, recorder);

    await handler(request('http://localhost/api/teams/nope'), context);

    expect(events).toHaveLength(0);
  });
});
