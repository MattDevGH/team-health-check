import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/**
 * Two projects, split by whether a test needs a document.
 *
 * Requirements: Feeling Responsive 5.1, 5.2
 *
 * Vitest 5 reports what each environment costs, and the answer was
 * uncomfortable: jsdom was built **once per test file**, 223 times, for more
 * than half the suite's wall-clock time. Only 36 of those files render
 * anything. The other 186 paid for a document they never touched.
 *
 * That cost is also the likeliest cause of the `magic-link/verify` hook
 * timeouts, which have been parked for a week looking like worker contention
 * with nothing measuring them.
 *
 * The split is by extension, and it holds exactly: every `.test.tsx` renders
 * something, and no `.test.ts` touches a document. That was checked rather than
 * assumed — a search for `document.`, `window.` and `@testing-library/react`
 * across the `.test.ts` files returned six hits, every one of them a local
 * variable called `window` or the word "window" in a sentence about delivery
 * windows.
 *
 * Chosen over `isolate: false`, which Vitest also suggests. That shares one
 * environment across files and would trade a slow suite for one where a test
 * can leave state behind for the next file — which is the failure this project
 * is least equipped to notice, because the symptom is a test that passes.
 */
/**
 * Kept out of both projects.
 *
 * `scripts/check-requirement-coverage.test.ts` lives outside `src`, and the
 * first version of this split scoped both projects to `src/**` — which ran 22
 * fewer tests and said nothing about it. A faster suite that quietly runs less
 * is the worst possible outcome of a performance change, and the only reason it
 * was caught is that the totals were compared before and after.
 */
const EXCLUDE = ['node_modules/**', 'e2e/**/*.spec.ts', '.next/**', 'dist/**'];

/**
 * Tests that open a real database, and therefore take real time.
 *
 * Requirements: Integration 10.6
 *
 * Ten of these create a SQLite file, apply the committed migrations and run
 * queries through the adapter. On Linux they finish inside Vitest's five-second
 * default with room to spare. On the Windows runner added on 2026-09-25 they
 * take five to ten seconds each, and `apply-migrations` failed on the first run
 * of that job with "Test timed out in 5000ms" after 9.9 seconds — while
 * neighbouring tests in the same file passed at 4.7 and 6.4.
 *
 * So the default was never right for these; Linux was simply fast enough to
 * hide it. Raising it for the whole node project would let a genuinely hung
 * unit test burn a minute before saying so, which is the wrong trade for the
 * two thousand tests that should finish in milliseconds.
 */
const REAL_DATABASE = 'src/tests/integration/**/*.test.ts';

export default defineConfig({
  plugins: [react()],
  /*
   * Path aliases resolved by Vite itself rather than by `vite-tsconfig-paths`.
   *
   * Vite 8 does this natively, and every test run printed a notice saying so.
   * Adopted as part of the Vitest 5 upgrade: one fewer dependency in the path
   * that resolves `@/` for 2,222 tests, and one fewer line of noise above every
   * result.
   */
  resolve: { tsconfigPaths: true },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          globals: true,
          setupFiles: ["./src/tests/setup-node.ts"],
          include: ["**/*.test.ts"],
          exclude: [...EXCLUDE, REAL_DATABASE],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          globals: true,
          setupFiles: ["./src/tests/setup-node.ts"],
          include: [REAL_DATABASE],
          exclude: EXCLUDE,
          // See REAL_DATABASE above: a slow runner, not a hung test
          testTimeout: 60_000,
          hookTimeout: 60_000,
        },
      },
      {
        extends: true,
        test: {
          name: "dom",
          environment: "jsdom",
          globals: true,
          setupFiles: ["./src/tests/setup.ts"],
          include: ["**/*.test.tsx"],
          exclude: EXCLUDE,
        },
      },
    ],
  },
});
