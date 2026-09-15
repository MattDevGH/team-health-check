/**
 * The recorder the application uses.
 *
 * Requirements: Knowing What Happened 4.3, 6.3
 *
 * Services take a recorder as a dependency, the way they take repositories —
 * this is the instance the production wiring hands them, and the one routes use
 * directly.
 *
 * **Silent under test.** A suite that wrote its own log lines would bury a
 * failing assertion in a thousand JSON records, and every run would print the
 * output of every boundary it exercised. The format is otherwise identical in
 * development and production, so what is read locally is what production shows.
 */

import { createRecorder, silentSink, type Recorder } from './recorder';

export { createRecorder, silentSink, ALLOWED_KEYS } from './recorder';
export type { Recorder, Sink, EventContext, Level } from './recorder';

/**
 * Vitest sets `VITEST`; `NODE_ENV` is `test` under both suites. Either is
 * enough, and checking both means a runner that sets only one still gets a
 * quiet suite.
 */
function underTest(): boolean {
  return process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';
}

export const recorder: Recorder = createRecorder(
  underTest() ? { sink: silentSink } : {},
);
