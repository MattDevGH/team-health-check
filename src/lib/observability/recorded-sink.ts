/**
 * Accounting for a notification that was sent, or was not.
 *
 * Requirements: Knowing What Happened 3.1, 3.2, 3.3, 3.4
 *
 * "I never got a message" had no answer. Every notification goes through one
 * sink — prompts, closing reminders, mid-session nudges, pre-session
 * notifications — and none left a trace, so a member who heard nothing and a
 * member who was never written to were the same case.
 *
 * A decorator, not a change to the notification service. That service decides
 * *whether* to notify somebody, which is business logic with its own tests;
 * this decides what to write down about the attempt.
 */

import type { NotificationSink } from '@/lib/services/notification.service';

import type { Recorder } from './recorder';

export function recordingSink(sink: NotificationSink, recorder: Recorder): NotificationSink {
  return {
    async send(memberId, type, payload) {
      try {
        await sink.send(memberId, type, payload);
      } catch (error) {
        /*
         * Recorded, then rethrown. Swallowing here would turn a failed
         * delivery into a silent success — the defect this milestone exists to
         * remove rather than repeat — and the caller is what decides whether a
         * failure is fatal, retryable, or expected.
         */
        recorder.error(`notification.${type}.failed`, {
          memberId,
          message: error instanceof Error ? error.message : String(error),
          errorName: error instanceof Error ? error.name : typeof error,
        });
        throw error;
      }

      /*
       * The name carries the type, because the name is what a filter matches.
       * A reminder that rendered identically to an opening prompt once passed a
       * "was the sink called" test for an entire milestone; two events that
       * cannot be told apart in a log would repeat that at a distance.
       *
       * The payload is deliberately not recorded. It holds the prompt itself —
       * question text, a session link that authenticates whoever holds it — and
       * none of that belongs in a record whose only job is saying whether
       * something arrived.
       */
      recorder.info(`notification.${type}.delivered`, { memberId });
    },
  };
}
