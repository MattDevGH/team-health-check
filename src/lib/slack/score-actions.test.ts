/**
 * Requirements: 5.7, 5.8, 5.9, 5.10
 *
 * These assert the reply a member would read and what was stored, not which
 * dependency was called. The reply text is the whole product of this function
 * — a member who submits from Slack sees nothing else.
 */

import { describe, it, expect, vi } from 'vitest';

import { applyScoreActions, type ScoreActionDeps } from './score-actions';

/** Dependencies that succeed, with the stored answers recorded for inspection. */
function workingDeps(overrides: Partial<ScoreActionDeps> = {}) {
  const stored: Array<{ questionId: string; score: number }> = [];

  const deps: ScoreActionDeps = {
    findMemberBySlackUserId: async () => 'member-1',
    findOpenSessionForMember: async () => 'session-1',
    questionTitle: async id => (id === 'q-delivering-value' ? 'Delivering Value' : id),
    upsertResponse: async ({ questionId, score }) => {
      stored.push({ questionId, score });
    },
    ...overrides,
  };

  return { deps, stored };
}

function scoreAction(value: string) {
  return { actionId: `score_${value.split(':')[0]}`, value };
}

describe('applyScoreActions', () => {
  it('stores a score and confirms it by name', async () => {
    const { deps, stored } = workingDeps();

    const reply = await applyScoreActions(deps, {
      slackUserId: 'U1',
      actions: [scoreAction('q-delivering-value:4')],
    });

    expect(stored).toEqual([{ questionId: 'q-delivering-value', score: 4 }]);
    expect(reply).toContain('Delivering Value');
    expect(reply).toContain('4');
  });

  it('applies every score in one payload', async () => {
    const { deps, stored } = workingDeps();

    await applyScoreActions(deps, {
      slackUserId: 'U1',
      actions: [scoreAction('q-delivering-value:4'), scoreAction('q-team-collaboration:2')],
    });

    expect(stored).toHaveLength(2);
  });

  /** Requirement 5.9 */
  it('says the session ended rather than storing, when none is open', async () => {
    const { deps, stored } = workingDeps({ findOpenSessionForMember: async () => null });

    const reply = await applyScoreActions(deps, {
      slackUserId: 'U1',
      actions: [scoreAction('q-delivering-value:4')],
    });

    expect(stored).toHaveLength(0);
    expect(reply).toMatch(/ended|closed/i);
  });

  it('tells an unlinked account what to do, without confirming they exist', async () => {
    const { deps, stored } = workingDeps({ findMemberBySlackUserId: async () => null });

    const reply = await applyScoreActions(deps, {
      slackUserId: 'U-stranger',
      actions: [scoreAction('q-delivering-value:4')],
    });

    expect(stored).toHaveLength(0);
    expect(reply).not.toBeNull();
  });

  it('has nothing to say when the payload names no user', async () => {
    const { deps } = workingDeps();

    expect(await applyScoreActions(deps, { actions: [scoreAction('q-1:3')] })).toBeNull();
  });

  it('ignores actions that are not score buttons', async () => {
    const { deps, stored } = workingDeps();

    const reply = await applyScoreActions(deps, {
      slackUserId: 'U1',
      actions: [{ actionId: 'open_dashboard', value: 'whatever' }],
    });

    expect(stored).toHaveLength(0);
    expect(reply).toBeNull();
  });

  /** Requirement 5.7 */
  it('names the question when a value will not parse', async () => {
    const { deps, stored } = workingDeps();

    const reply = await applyScoreActions(deps, {
      slackUserId: 'U1',
      actions: [scoreAction('q-delivering-value:9')],
    });

    expect(stored).toHaveLength(0);
    expect(reply).toContain('Delivering Value');
  });

  /**
   * Losing four answers because the third failed would be worse than saying
   * which one did not land.
   */
  it('keeps applying after one answer fails to store', async () => {
    const stored: string[] = [];
    const { deps } = workingDeps({
      upsertResponse: async ({ questionId }) => {
        if (questionId === 'q-team-collaboration') throw new Error('write failed');
        stored.push(questionId);
      },
    });

    const reply = await applyScoreActions(deps, {
      slackUserId: 'U1',
      actions: [
        scoreAction('q-delivering-value:4'),
        scoreAction('q-team-collaboration:2'),
        scoreAction('q-ease-of-delivery:5'),
      ],
    });

    expect(stored).toEqual(['q-delivering-value', 'q-ease-of-delivery']);
    expect(reply?.split('\n')).toHaveLength(3);
  });

  it('lets an infrastructure failure propagate, so the drain retries it', async () => {
    const { deps } = workingDeps({
      findMemberBySlackUserId: vi.fn(async () => {
        throw new Error('database down');
      }),
    });

    // The caller has already acknowledged Slack. A throw reaches the drain,
    // which retries under backoff — better than a silently dropped answer.
    await expect(
      applyScoreActions(deps, { slackUserId: 'U1', actions: [scoreAction('q-1:3')] }),
    ).rejects.toThrow();
  });
});
