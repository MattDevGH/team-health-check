/**
 * Reading a Slack user's verified email.
 *
 * Requirements: Slack Sign In 3.1, 3.5
 *
 * The one thing that makes sign-in self-service: with it, a member nobody has
 * set up can run the command and be matched to their team by an address Slack
 * has already verified. Without it, somebody has to assert every binding by
 * hand before anybody can get in.
 *
 * `users.info` needs the `users:read.email` scope. This project removed
 * `users:read` once — and the README says exactly why: *"nothing calls
 * `users.info`"*. It was dropped as unused rather than as unwanted, and this is
 * the call that makes it used.
 *
 * A port rather than a direct fetch, because the interesting behaviour is what
 * happens when the answer is unavailable: a guest account, a missing scope, a
 * Slack outage. All three have to look the same to the caller — absent, not
 * broken — so that sign-in degrades to the manager-asserted path instead of
 * failing opaquely.
 */

import { recorder as defaultRecorder, type Recorder } from '@/lib/observability';

export interface SlackUserDirectory {
  /**
   * The Slack user's verified email, or null when it cannot be read.
   *
   * Null covers every reason at once, deliberately. A caller that had to tell
   * "guest account" from "missing scope" from "Slack is down" would have three
   * fallbacks where one will do, and the fallback is the same in all three
   * cases: ask a delivery manager to record the binding.
   */
  emailFor(slackUserId: string): Promise<string | null>;
}

interface SlackUserInfoResponse {
  ok: boolean;
  error?: string;
  user?: { profile?: { email?: string | null } };
}

/**
 * The real directory, over Slack's Web API.
 *
 * Failures are recorded and then reported as absence. The record is what stops
 * a permanently missing scope looking like a workspace full of guest accounts:
 * `slack.email.unavailable` carries Slack's own error string, so
 * `missing_scope` is visible to somebody reading the log rather than inferred
 * from a member who cannot sign in.
 */
export function createSlackUserDirectory(
  botToken: string,
  recorder: Recorder = defaultRecorder,
): SlackUserDirectory {
  return {
    async emailFor(slackUserId: string): Promise<string | null> {
      try {
        const response = await fetch(
          `https://slack.com/api/users.info?user=${encodeURIComponent(slackUserId)}`,
          { headers: { Authorization: `Bearer ${botToken}` } },
        );

        if (!response.ok) {
          recorder.error('slack.email.unavailable', {
            reason: `HTTP ${response.status}`,
          });
          return null;
        }

        const data = (await response.json()) as SlackUserInfoResponse;
        if (!data.ok) {
          recorder.error('slack.email.unavailable', { reason: data.error ?? 'unknown' });
          return null;
        }

        /*
         * A profile with no email is the ordinary case for a guest or a bot,
         * not a fault — so it is absence without a record. Recording it would
         * put a line in the log every time somebody outside the team tried
         * the command.
         */
        return data.user?.profile?.email ?? null;
      } catch (error: unknown) {
        recorder.error('slack.email.unavailable', {
          reason: error instanceof Error ? error.message : String(error),
        });
        return null;
      }
    },
  };
}
