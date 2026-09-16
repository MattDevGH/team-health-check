/**
 * Accounting for a prompt that was sent, or was not.
 *
 * Requirements: Knowing What Happened 3.1, 3.2, 3.3, 3.4
 *
 * "I never got a message" had no answer. Every notification in this application
 * goes through one sink — prompts, closing reminders, mid-session nudges,
 * pre-session notifications — and none of them left a trace, so a member who
 * heard nothing and a member who was never written to were the same case.
 *
 * A decorator rather than a change to the notification service: the service
 * decides *whether* to notify somebody, which is business logic with its own
 * tests, and this decides what to write down about the attempt.
 */

import { describe, expect, it } from 'vitest';

import { createRecorder } from '@/lib/observability';
import { recordingSink } from '@/lib/observability/recorded-sink';

function harness(send: (memberId: string, type: string) => Promise<void>) {
  const events: Record<string, unknown>[] = [];
  const recorder = createRecorder({
    sink: { write: line => events.push(JSON.parse(line) as Record<string, unknown>) },
  });

  return {
    events,
    sink: recordingSink({ send: (memberId, type) => send(memberId, type) }, recorder),
  };
}

const delivers = async () => {};
const fails = async () => {
  throw new Error('slack said no');
};

describe('a delivery that worked', () => {
  it('records the member it reached', async () => {
    const { sink, events } = harness(delivers);

    await sink.send('member-1', 'slack_prompt', {});

    expect(events[0]).toMatchObject({ memberId: 'member-1' });
  });

  it('names the event after what was sent', async () => {
    const { sink, events } = harness(delivers);

    await sink.send('member-1', 'slack_prompt', {});

    expect(events[0].event).toBe('notification.slack_prompt.delivered');
  });

  it('tells a reminder apart from an opening prompt', async () => {
    /*
     * These have been confused before, expensively: a reminder that rendered
     * identically to an opening prompt passed a "was the sink called" test for
     * an entire milestone, and the requirement behind it was never built.
     *
     * The name is what a filter matches, so the name is what must differ.
     */
    const { sink, events } = harness(delivers);

    await sink.send('member-1', 'slack_prompt', {});
    await sink.send('member-1', 'closing_reminder', {});

    expect(events.map(e => e.event)).toEqual([
      'notification.slack_prompt.delivered',
      'notification.closing_reminder.delivered',
    ]);
  });
});

describe('a delivery that failed', () => {
  it('records the member, and says it failed', async () => {
    const { sink, events } = harness(fails);

    await expect(sink.send('member-1', 'slack_prompt', {})).rejects.toThrow();

    expect(events[0]).toMatchObject({
      event: 'notification.slack_prompt.failed',
      memberId: 'member-1',
      level: 'error',
    });
  });

  it('records why, so the failure can be acted on', async () => {
    const { sink, events } = harness(fails);

    await expect(sink.send('member-1', 'slack_prompt', {})).rejects.toThrow();

    expect(events[0].message).toContain('slack said no');
  });

  it('still throws, because the caller decides what a failure means', async () => {
    // Swallowing here would turn a failed delivery into a silent success, which
    // is the defect this milestone exists to remove rather than repeat
    const { sink } = harness(fails);

    await expect(sink.send('member-1', 'slack_prompt', {})).rejects.toThrow('slack said no');
  });
});

describe('recording and delivering are independent', () => {
  it('delivers even when recording throws', async () => {
    /*
     * Requirement 3.3, and the reason the recorder swallows its own errors. A
     * member not being prompted because a log line could not be written would
     * be the worst possible trade.
     */
    let delivered = false;
    const exploding = createRecorder({
      sink: {
        write: () => {
          throw new Error('no room');
        },
      },
    });
    const sink = recordingSink(
      {
        send: async () => {
          delivered = true;
        },
      },
      exploding,
    );

    await sink.send('member-1', 'slack_prompt', {});

    expect(delivered).toBe(true);
  });

  it('records even when delivery throws', async () => {
    const { sink, events } = harness(fails);

    await sink.send('member-1', 'slack_prompt', {}).catch(() => {});

    expect(events).toHaveLength(1);
  });
});

describe('what a delivery record may not contain', () => {
  it('carries no part of the message that was sent', async () => {
    /*
     * The payload holds the prompt itself — question text, and in a reminder
     * the member's own name. None of it belongs in a record whose purpose is
     * saying whether something arrived.
     */
    const { sink, events } = harness(delivers);

    await sink.send('member-1', 'slack_prompt', {
      questionText: 'How safe do you feel speaking up?',
      link: 'https://x.invalid/session/Hs82kdMz0qLpWnTyUvBxRc41',
    });

    const written = JSON.stringify(events[0]);
    expect(written).not.toContain('speaking up');
    expect(written).not.toContain('Hs82kdMz0qLpWnTyUvBxRc41');
  });
});
