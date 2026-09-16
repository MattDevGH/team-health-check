/**
 * What a scheduler run did, in a sentence.
 *
 * Requirements: Knowing What Happened 1.4
 *
 * The response carried counts — `{ opened: 0, closed: 0, materialised: 2 }` —
 * and the verdict on seeing it in cron-job.org was that it did not look like
 * something a person could act on at a glance; perhaps a reminder was needed of
 * what it was telling them.
 *
 * A record that needs a reminder is not at a glance. The counts were never the
 * missing piece: `opened: 0` is correct on a Wednesday and a failure on Monday
 * at 15:30, and no number says which. The reason does.
 *
 * Kept apart from the scheduler because this is presentation — the scheduler
 * knows what happened, and this decides how to say it.
 */

import { SKIP_PHRASES, type SkipReason } from '@/lib/services/tick-reasons';

export interface TickFacts {
  opened: number;
  closed: number;
  materialised: number;
  prompts: number;
  /** How many teams were passed over, by reason. */
  reasons: Record<string, number>;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** "opened 1 check and prompted 3 members", or nothing if it did nothing. */
function whatItDid(facts: TickFacts): string[] {
  const done: string[] = [];

  if (facts.opened > 0) {
    const prompted = facts.prompts > 0 ? `, prompting ${plural(facts.prompts, 'member')}` : '';
    done.push(`opened ${plural(facts.opened, 'check')}${prompted}`);
  }

  if (facts.closed > 0) done.push(`closed ${plural(facts.closed, 'check')}`);

  /*
   * "Computed results for", not "materialised". The word is ours and the
   * sentence is for whoever is looking at a cron dashboard.
   */
  if (facts.materialised > 0) {
    done.push(`computed results for ${plural(facts.materialised, 'check')}`);
  }

  return done;
}

/** "2 teams outside the collection window, 1 team with no schedule configured". */
function whatItPassedOver(reasons: Record<string, number>): string {
  return Object.entries(reasons)
    .sort(([, a], [, b]) => b - a)
    .map(([reason, count]) => {
      /*
       * The reasons were written to stand alone in a log line, so each has a
       * phrase for following a count. An unrecognised one cannot reach here
       * from the scheduler — the type sees to that — but a stored record or a
       * future caller could, and a clumsy sentence beats a missing reason.
       */
      const phrase = SKIP_PHRASES[reason as SkipReason] ?? reason;
      return `${plural(count, 'team')} ${phrase}`;
    })
    .join(', ');
}

export function summariseTick(facts: TickFacts): string {
  const did = whatItDid(facts);
  const passed = whatItPassedOver(facts.reasons);

  if (did.length > 0) {
    const sentence = did.join(', ');
    return passed === ''
      ? `Ran and ${sentence}.`
      : `Ran and ${sentence}. Passed over ${passed}.`;
  }

  /*
   * Nothing happened, which six days a week is correct and on the seventh is a
   * failure. The reason is the whole difference, so it is the sentence.
   */
  if (passed === '') {
    // Not "nothing was due" — there was nothing that could be due
    return 'Ran with no teams to check.';
  }

  return `Ran, nothing was due: ${passed}.`;
}
