/**
 * Recording what happened, at the edges.
 *
 * Requirements: Knowing What Happened 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 6.1, 6.2
 * Properties: 2, 3
 *
 * The application kept no record of itself. Eleven `console` calls, all but one
 * in a catch block, and the scheduler tick — which opens checks, closes them and
 * sends every prompt — logging nothing at all. The dashboard's "the scheduler
 * may not be running" exists because a stalled tick was only visible from the
 * outside; this is the inside.
 *
 * A module rather than a library. What is needed is `JSON.stringify` and a place
 * to decide what may be written, which is this file — not a dependency, a
 * configuration format, and something to audit in an application whose whole
 * point is costing nothing to run.
 *
 * **Boundaries only.** Decisions and outcomes where the system meets the world.
 * An agent can reconstruct what the code would do; nothing can reconstruct what
 * it did at 15:30 on a Monday, and that is the only part worth writing down.
 */

export type Level = 'info' | 'warn' | 'error';

/**
 * Everything an event may carry.
 *
 * An allowlist, not a denylist: anything a caller invents — now or in two years
 * — is absent unless it was named here. A denylist would need to have
 * anticipated `score`, and the cost of missing one is a member's answer in a log
 * file, in a product that hides that answer until three people have given one.
 *
 * Ids rather than names and addresses. `memberId` is already in the database;
 * an email address is the person.
 */
export const ALLOWED_KEYS = [
  // Who and what
  'tickId',
  'teamId',
  'sessionId',
  'memberId',
  'questionId',
  /** Joins an event to the audit entry a delivery manager reads. */
  'auditEntryId',

  // What happened
  'message',
  'reason',
  'channel',
  'route',
  'errorName',

  // How much, and how long
  'count',
  'attempts',
  'durationMs',
  'opened',
  'closed',
  'materialised',
  'prompts',
] as const;

export type AllowedKey = (typeof ALLOWED_KEYS)[number];

export type EventContext = Partial<Record<AllowedKey, string | number>>;

export interface Sink {
  write(line: string): void;
}

export interface RecorderDeps {
  sink?: Sink;
  now?: () => Date;
}

export interface Recorder {
  info(event: string, context?: EventContext): void;
  warn(event: string, context?: EventContext): void;
  error(event: string, context?: EventContext): void;
}

const PERMITTED = new Set<string>(ALLOWED_KEYS);

/**
 * Anything long enough and opaque enough to be a token.
 *
 * The leak an allowlist alone does not close: a Slack or Resend failure arrives
 * as prose, and the prose contains a URL, and the URL carries a session link
 * that authenticates whoever holds it.
 *
 * A heuristic, and named as one. It errs towards redacting — a message with a
 * word missing is still useful, and a message with a live token in it is a
 * security incident.
 */
const TOKEN_SHAPED = /[A-Za-z0-9_-]{24,}/g;

/**
 * The fields that carry prose, and so can carry a URL.
 *
 * Redaction is applied here and nowhere else. It was applied to every field
 * first, and ate the ids: a team id is a UUID, a UUID is thirty-six characters
 * of letters, digits and hyphens, and the pattern that catches a session token
 * catches that exactly. Every event came out carrying `teamId: "[redacted]"` —
 * the record destroying the one thing it exists to carry.
 *
 * An id field cannot hold a token, because the allowlist decides what an id
 * field is. Prose can hold anything.
 */
const PROSE_FIELDS = new Set(['message', 'reason', 'route']);

function redact(value: string): string {
  return value.replace(TOKEN_SHAPED, '[redacted]');
}

/** Only the allowed keys, with anything token-shaped masked. */
function clean(context: EventContext): Record<string, string | number> {
  const cleaned: Record<string, string | number> = {};

  for (const [key, value] of Object.entries(context)) {
    if (!PERMITTED.has(key)) continue;
    if (value === undefined || value === null) continue;

    cleaned[key] =
      typeof value === 'string' && PROSE_FIELDS.has(key) ? redact(value) : value;
  }

  return cleaned;
}

const consoleSink: Sink = {
  write: line => {
    console.log(line);
  },
};

export function createRecorder(deps: RecorderDeps = {}): Recorder {
  const sink = deps.sink ?? consoleSink;
  const now = deps.now ?? (() => new Date());

  function record(level: Level, event: string, context: EventContext = {}): void {
    /*
     * Nothing here may reach the caller.
     *
     * The one place in this codebase where swallowing an error is right: a
     * member answering a health check must not lose their answers because a
     * line could not be written. An observability feature causing an outage is
     * the worst trade available.
     */
    try {
      sink.write(JSON.stringify({ at: now().toISOString(), level, event, ...clean(context) }));
    } catch {
      // Deliberately silent. See above.
    }
  }

  return {
    info: (event, context) => record('info', event, context),
    warn: (event, context) => record('warn', event, context),
    error: (event, context) => record('error', event, context),
  };
}

/**
 * Writes nothing.
 *
 * Used by the test suite, so a run's output is its assertions rather than a
 * thousand JSON lines with a failure somewhere inside them.
 */
export const silentSink: Sink = { write: () => {} };
