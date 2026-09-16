/**
 * The reads a trends response is built from, and what they wait for.
 *
 * Requirements: Feeling Responsive 3.1, 3.3
 * Properties: 2 (a budget is never met by losing data), 3 (only reads overlap)
 *
 * The route awaited four independent reads one after another: the privacy mode,
 * the question catalogue, the team's sessions, and their averages. Given a team
 * id, none of them needs any of the others, so three of the four were waiting
 * for no reason.
 *
 * As in the profile service, concurrency is asserted by ordering rather than by
 * timing: one read is held open and the others must already have started. A
 * stopwatch would measure the machine.
 */

import { describe, expect, it, vi } from 'vitest';

import { loadTrendInputs, type TrendInputsDeps } from '@/lib/services/trend-inputs.service';

const TEAM = 'team-1';

function deps(overrides: Partial<TrendInputsDeps> = {}): TrendInputsDeps {
  return {
    getPrivacyMode: async () => 'anonymous',
    findQuestions: async () => [
      { id: 'q-delivering-value', title: 'Delivering Value', description: 'How well…?', displayOrder: 1 },
    ],
    findSessions: async () => [],
    getSessionAverages: async () => [],
    getSchedulerLastRanAt: async () => null,
    ...overrides,
  };
}

/** A promise this test decides when to settle. */
function deferred<T>() {
  let release: (value: T) => void = () => {};
  const promise = new Promise<T>(resolve => {
    release = resolve;
  });
  return { promise, release };
}

describe('loadTrendInputs', () => {
  it('returns all four, so nothing the route needs has been dropped', async () => {
    const inputs = await loadTrendInputs(deps(), TEAM);

    expect(inputs.privacyMode).toBe('anonymous');
    expect(inputs.questions).toHaveLength(1);
    expect(inputs.sessions).toEqual([]);
    expect(inputs.averages).toEqual([]);
  });

  it('asks about the team it was given', async () => {
    const askedFor: string[] = [];

    await loadTrendInputs(
      deps({
        getPrivacyMode: async (teamId: string) => {
          askedFor.push(teamId);
          return 'attributed';
        },
        findSessions: async (teamId: string) => {
          askedFor.push(teamId);
          return [];
        },
        getSessionAverages: async (teamId: string) => {
          askedFor.push(teamId);
          return [];
        },
      }),
      TEAM,
    );

    expect(askedFor).toEqual([TEAM, TEAM, TEAM]);
  });

  it('does not make the catalogue wait for the sessions', async () => {
    const heldSessions = deferred<[]>();
    const catalogueAsked = vi.fn();

    const pending = loadTrendInputs(
      deps({
        findSessions: () => heldSessions.promise,
        findQuestions: async () => {
          catalogueAsked();
          return [];
        },
      }),
      TEAM,
    );

    await Promise.resolve();
    await Promise.resolve();

    expect(catalogueAsked, 'the catalogue waited for the sessions').toHaveBeenCalled();

    heldSessions.release([]);
    await pending;
  });

  it('does not make the averages wait for the privacy mode', async () => {
    // Two reads with nothing to do with each other: one is a team setting, the
    // other is a table of numbers
    const heldPrivacy = deferred<string>();
    const averagesAsked = vi.fn();

    const pending = loadTrendInputs(
      deps({
        getPrivacyMode: () => heldPrivacy.promise,
        getSessionAverages: async () => {
          averagesAsked();
          return [];
        },
      }),
      TEAM,
    );

    await Promise.resolve();
    await Promise.resolve();

    expect(averagesAsked, 'the averages waited for the privacy mode').toHaveBeenCalled();

    heldPrivacy.release('anonymous');
    await pending;
  });

  it('starts every one of the four before any of them finishes', async () => {
    /*
     * The property in full. Each read is held open; all four must have started
     * anyway, which is only true if they were begun together.
     */
    const held = deferred<never>();
    const started = new Set<string>();

    const record = (name: string) => {
      started.add(name);
      return held.promise;
    };

    void loadTrendInputs(
      {
        getPrivacyMode: () => record('privacy') as Promise<string>,
        findQuestions: () => record('questions') as Promise<never>,
        findSessions: () => record('sessions') as Promise<never>,
        getSessionAverages: () => record('averages') as Promise<never>,
        getSchedulerLastRanAt: () => record('heartbeat') as Promise<never>,
      },
      TEAM,
    );

    await Promise.resolve();
    await Promise.resolve();

    // The heartbeat among them: it needs no team id and waits for nothing, so
    // it has no business being a fifth round of waiting
    expect([...started].sort()).toEqual([
      'averages',
      'heartbeat',
      'privacy',
      'questions',
      'sessions',
    ]);
  });
});
