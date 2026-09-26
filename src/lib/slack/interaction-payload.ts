/**
 * Decoding what Slack sends to `/api/slack/interactions`.
 *
 * Requirements: Slack Sign In NFR 1.5, NFR 1.6
 *
 * The route used to do this:
 *
 *     const payload: SlackInteractionPayload = JSON.parse(payloadStr);
 *
 * `JSON.parse` returns `any`, so the annotation is a claim rather than a check.
 * The compiler agreed, nothing was verified, and a body that was not JSON threw
 * out of the handler instead of being refused — at the one boundary where this
 * project's "no `any`, use `unknown` with type guards" rule matters most.
 *
 * A verified signature makes that harder to reach rather than unreachable:
 * Slack's own retries, a payload shape that changes under us, and anything
 * holding the signing secret all arrive past that door.
 *
 * Everything here returns a value or `null`. Nothing throws, because the
 * caller's job is to refuse, not to catch.
 */

/** One action from a `block_actions` payload, in this application's spelling. */
export interface SlackAction {
  actionId?: string;
  blockId?: string;
  value?: string;
  type?: string;
}

/** A decoded interaction, carrying only the fields this application reads. */
export interface SlackInteractionPayload {
  type: string;
  user?: { id: string; name?: string };
  actions?: SlackAction[];
  responseUrl?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The value if it is a non-empty string, otherwise undefined. */
function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * The user, only when the id is a string.
 *
 * An identity claim that is not a string is not an identity claim, and this is
 * the field every route behind here resolves a member from.
 */
function decodeUser(value: unknown): SlackInteractionPayload['user'] {
  if (!isRecord(value)) return undefined;

  const id = stringOrUndefined(value.id);
  if (id === undefined) return undefined;

  return { id, name: stringOrUndefined(value.name) };
}

/** Actions that are shaped like actions. Anything else is dropped, not guessed at. */
function decodeActions(value: unknown): SlackAction[] | undefined {
  if (!Array.isArray(value)) return undefined;

  return value.filter(isRecord).map(entry => ({
    actionId: stringOrUndefined(entry.action_id),
    blockId: stringOrUndefined(entry.block_id),
    value: stringOrUndefined(entry.value),
    type: stringOrUndefined(entry.type),
  }));
}

/**
 * Decodes an interaction payload, or returns null if it is not one.
 *
 * `type` is required because it is what the route branches on; a payload that
 * cannot say what it is has nothing the application can do with it.
 */
export function decodeInteractionPayload(raw: string): SlackInteractionPayload | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isRecord(parsed)) return null;

  const type = stringOrUndefined(parsed.type);
  if (type === undefined) return null;

  return {
    type,
    user: decodeUser(parsed.user),
    actions: decodeActions(parsed.actions),
    responseUrl: stringOrUndefined(parsed.response_url),
  };
}

/**
 * Requirement NFR 1.6
 *
 * Reads a score action value, which this application emits as
 * `questionId:score`.
 *
 * Exact rather than lenient. `parseInt` reads "3abc" as 3, "4.9" as 4 and
 * " 3" as 3, so values the application never emitted were accepted as though
 * it had. A single digit 1 to 5 is the whole of what it sends.
 *
 * Split on the last colon: question ids are ours and scores are not, so the
 * ambiguity belongs on the side we control.
 */
export function parseScoreAction(value: string): { questionId: string; score: number } | null {
  const separator = value.lastIndexOf(':');
  if (separator <= 0) return null;

  const questionId = value.slice(0, separator);
  const score = value.slice(separator + 1);

  if (!/^[1-5]$/.test(score)) return null;

  return { questionId, score: Number(score) };
}
