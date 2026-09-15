/**
 * Recording what happened.
 *
 * Requirements: Knowing What Happened 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 5.4, 6.1, 6.2
 * Properties: 2 (no forbidden key reaches the output), 3 (logging is inert)
 *
 * The application kept no record of itself: eleven `console` calls, all but one
 * in a catch block, and the scheduler tick — which opens checks, closes them and
 * sends every prompt — logging nothing at all.
 *
 * Two things this has to get right before it is used anywhere. It must never
 * carry a member's answer, because the product suppresses a score below three
 * responses and a log line would step around that. And it must never break the
 * thing it records, because an observability feature causing an outage is the
 * worst possible trade.
 */

import { describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';

import { createRecorder, ALLOWED_KEYS } from '@/lib/observability/recorder';

/** Collects what was written, so a test reads the record rather than stdout. */
function capturingSink() {
  const lines: string[] = [];
  return {
    sink: { write: (line: string) => lines.push(line) },
    lines,
    events: () => lines.map(line => JSON.parse(line) as Record<string, unknown>),
  };
}

const at = (iso: string) => () => new Date(iso);

describe('an event', () => {
  it('is one line of JSON', () => {
    const { sink, lines } = capturingSink();
    const recorder = createRecorder({ sink });

    recorder.info('session.opened', { teamId: 'team-1' });

    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toContain('\n');
    expect(() => JSON.parse(lines[0])).not.toThrow();
  });

  it('carries the name it was given, which is what a filter matches', () => {
    const { sink, events } = capturingSink();

    createRecorder({ sink }).info('session.opened', { teamId: 'team-1' });

    expect(events()[0].event).toBe('session.opened');
  });

  it('carries its level', () => {
    const { sink, events } = capturingSink();
    const recorder = createRecorder({ sink });

    recorder.info('a.thing');
    recorder.warn('another.thing');
    recorder.error('a.failure');

    expect(events().map(e => e.level)).toEqual(['info', 'warn', 'error']);
  });

  it('carries a timestamp, since a line without one cannot be placed in a sequence', () => {
    const { sink, events } = capturingSink();

    createRecorder({ sink, now: at('2026-09-16T09:00:00.000Z') }).info('a.thing');

    expect(events()[0].at).toBe('2026-09-16T09:00:00.000Z');
  });

  it('carries the ids it was given', () => {
    const { sink, events } = capturingSink();

    createRecorder({ sink }).info('session.opened', {
      teamId: 'team-1',
      sessionId: 'session-2',
      memberId: 'member-3',
    });

    expect(events()[0]).toMatchObject({
      teamId: 'team-1',
      sessionId: 'session-2',
      memberId: 'member-3',
    });
  });

  it('carries a message for a person reading the stream', () => {
    // The name is what a filter matches; the message is what a human skims
    const { sink, events } = capturingSink();

    createRecorder({ sink }).warn('tick.skipped', { message: 'no schedule configured' });

    expect(events()[0].message).toBe('no schedule configured');
  });

  it('writes to the console when nothing else is supplied', () => {
    /*
     * The default has to work, or production records nothing while every test
     * passes against an injected sink.
     */
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    try {
      createRecorder().info('session.opened', { teamId: 'team-1' });

      expect(log).toHaveBeenCalledTimes(1);
      expect(String(log.mock.calls[0][0])).toContain('session.opened');
    } finally {
      log.mockRestore();
    }
  });
});

describe('what an event may not carry', () => {
  it('drops a response score', () => {
    /*
     * The product hides a score until three people have answered. A log line
     * carrying one would step around the whole of that, for the convenience of
     * whoever was debugging.
     */
    const { sink, lines } = capturingSink();

    createRecorder({ sink }).info('response.saved', {
      teamId: 'team-1',
      score: 2,
    } as never);

    expect(lines[0]).not.toContain('score');
    expect(lines[0]).toContain('team-1');
  });

  it('drops a trend indicator, which identifies a person just as a score does', () => {
    const { sink, lines } = capturingSink();

    createRecorder({ sink }).info('response.saved', { trendIndicator: 'declining' } as never);

    expect(lines[0]).not.toContain('declining');
  });

  it('drops an email address, preferring the id that is already in the database', () => {
    const { sink, lines } = capturingSink();

    createRecorder({ sink }).info('prompt.delivered', {
      memberId: 'member-1',
      email: 'someone@example.invalid',
    } as never);

    expect(lines[0]).not.toContain('example.invalid');
    expect(lines[0]).toContain('member-1');
  });

  it('drops a token handed to it by name', () => {
    const { sink, lines } = capturingSink();

    createRecorder({ sink }).info('auth.refused', { token: 'sk-live-abcdef' } as never);

    expect(lines[0]).not.toContain('sk-live-abcdef');
  });

  it('redacts something token-shaped inside a message', () => {
    /*
     * The leak that an allowlist alone does not close. A Slack or Resend error
     * arrives as prose with a URL in it, and the URL carries a session link.
     */
    const { sink, lines } = capturingSink();

    createRecorder({ sink }).error('prompt.failed', {
      message: 'POST https://x.invalid/session/Hs82kdMz0qLpWnTyUvBxRc41 failed',
    });

    expect(lines[0]).not.toContain('Hs82kdMz0qLpWnTyUvBxRc41');
    expect(lines[0]).toContain('[redacted]');
  });

  it('leaves ordinary prose alone', () => {
    // Redaction that ate the message would make the record useless
    const { sink, events } = capturingSink();

    createRecorder({ sink }).warn('tick.skipped', { message: 'no schedule configured' });

    expect(events()[0].message).toBe('no schedule configured');
  });
});

describe('the allowlist, over arbitrary context', () => {
  it('never writes a key it was not told to allow', () => {
    /*
     * An allowlist is an invariant, not three examples. Anything a caller
     * invents — now or in two years — is absent unless it was named.
     */
    fc.assert(
      fc.property(fc.dictionary(fc.string(), fc.oneof(fc.string(), fc.integer())), context => {
        const { sink, events } = capturingSink();

        createRecorder({ sink }).info('a.thing', context as never);

        const written = Object.keys(events()[0]);
        const permitted = new Set<string>([...ALLOWED_KEYS, 'event', 'level', 'at']);

        expect(written.every(key => permitted.has(key))).toBe(true);
      }),
    );
  });

  it('keeps every allowed key it is given', () => {
    // The other half: an allowlist that dropped everything would pass the test
    // above and record nothing
    const { sink, events } = capturingSink();
    const context = Object.fromEntries(ALLOWED_KEYS.map(key => [key, 'x']));

    createRecorder({ sink }).info('a.thing', context as never);

    for (const key of ALLOWED_KEYS) {
      expect(events()[0]).toHaveProperty(key);
    }
  });
});

describe('when recording goes wrong', () => {
  it('does not propagate a sink that throws', () => {
    /*
     * The one place in this codebase where swallowing an error is right. A
     * member answering a health check must not lose their answers because a
     * log line could not be written.
     */
    const recorder = createRecorder({
      sink: {
        write: () => {
          throw new Error('disk full');
        },
      },
    });

    expect(() => recorder.info('a.thing')).not.toThrow();
  });

  it('does not propagate context that cannot be serialised', () => {
    const { sink } = capturingSink();
    const circular: Record<string, unknown> = { teamId: 'team-1' };
    circular.self = circular;

    expect(() => createRecorder({ sink }).info('a.thing', circular as never)).not.toThrow();
  });

  it('leaves the caller’s value untouched whether it wrote or threw', () => {
    // Property 3: logging is inert
    const failing = createRecorder({
      sink: {
        write: () => {
          throw new Error('nope');
        },
      },
    });
    const working = createRecorder({ sink: capturingSink().sink });

    const run = (recorder: { info: (name: string) => void }) => {
      recorder.info('a.thing');
      return 'the answer';
    };

    expect(run(failing)).toBe(run(working));
  });
});

describe('the recorder the application uses', () => {
  it('writes nothing while the suite is running', async () => {
    /*
     * Requirement 6.3. Without this, every test that exercises a boundary
     * prints a JSON line, and a failing assertion has to be found among them.
     *
     * Asserted through the console rather than by reading a flag: the question
     * is whether anything is written, not which branch was taken.
     */
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    try {
      const { recorder } = await import('@/lib/observability');
      recorder.info('a.thing', { teamId: 'team-1' });

      expect(log).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });
});
