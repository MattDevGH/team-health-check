/**
 * Measures how long the deployed application takes to answer.
 *
 * Requirements: Feeling Responsive 5.1, 5.2, 5.3
 *
 *   npx tsx scripts/measure-production.ts
 *   npx tsx scripts/measure-production.ts https://some-preview.vercel.app
 *
 * **A deliberate check, never a CI gate.** Wall-clock timings vary with the
 * machine, the network and the time of day; a gate built on them fails on a
 * slow morning, and a test that fails for reasons unrelated to the change is a
 * test somebody disables. The gates that do run in CI count queries, requests
 * and layout shift — see `docs/performance.md`.
 *
 * Reads nothing and writes nothing: every endpoint below is either static or
 * answers without a session, so this can be run against production safely and
 * as often as you like.
 */

import { summarise, impliedQueryCost, type LatencySummary } from '../src/lib/performance/latency-summary';

const DEFAULT_TARGET = 'https://team-health-check-pi.vercel.app';

/** Samples per endpoint, after a warm-up. Enough for a median, quick enough to run. */
const SAMPLES = 10;

interface Probe {
  name: string;
  path: string;
  /** What this endpoint proves, printed alongside the number. */
  measures: string;
}

/*
 * Three endpoints, chosen so that subtracting one from another isolates a layer.
 *
 * The signed-out profile request returns 401 before touching the database, so
 * it measures the network and the function and nothing else. The session-link
 * lookup runs exactly one query before returning 404. The difference between
 * them is one database round trip — which is how the Washington-to-Dublin
 * problem was found, and how it was confirmed fixed.
 */
const PROBES: Probe[] = [
  { name: 'static page', path: '/', measures: 'the edge, with no function at all' },
  { name: 'no database', path: '/api/me', measures: 'network and function (401 before any query)' },
  {
    name: 'one query',
    path: '/api/auth/session-link/does-not-exist',
    measures: 'the same, plus a single database round trip (404)',
  },
];

async function timeOnce(url: string): Promise<number> {
  const started = performance.now();
  await fetch(url, { headers: { 'cache-control': 'no-cache' } });
  return performance.now() - started;
}

async function sample(base: string, probe: Probe): Promise<LatencySummary> {
  const url = `${base}${probe.path}`;

  // Warm the function first. A cold start is ~1s against ~90ms warm, and it is
  // a real cost but not the one being compared here.
  await timeOnce(url);

  const samples: number[] = [];
  for (let i = 0; i < SAMPLES; i += 1) {
    samples.push(await timeOnce(url));
  }

  return summarise(samples);
}

function round(value: number): string {
  return `${Math.round(value)}ms`;
}

async function main(): Promise<void> {
  const base = (process.argv[2] ?? DEFAULT_TARGET).replace(/\/$/, '');

  console.log(`Measuring ${base}`);
  console.log(`${SAMPLES} samples per endpoint, after a warm-up.\n`);

  const results = new Map<string, LatencySummary>();

  for (const probe of PROBES) {
    const summary = await sample(base, probe);
    results.set(probe.name, summary);

    console.log(`  ${probe.name.padEnd(13)} median ${round(summary.median).padEnd(8)} (min ${round(summary.min)}, max ${round(summary.max)})`);
    console.log(`  ${''.padEnd(13)} ${probe.measures}\n`);
  }

  const withQuery = results.get('one query');
  const withoutQuery = results.get('no database');

  if (withQuery && withoutQuery) {
    const cost = impliedQueryCost(withQuery, withoutQuery);
    console.log(
      cost === null
        ? '  One database round trip: below the noise between these two runs, which is\n' +
            '  what it should look like when the function and the database share a region.'
        : `  One database round trip: about ${round(cost)}.`,
    );
  }

  console.log(
    '\nBaseline, 2026-09-15, from a UK client.\n' +
      '\nMeasured with curl, which pays for a fresh TLS handshake every time and so\n' +
      'reads higher than this script does. Kept because it is what the region\n' +
      'decision was made on:\n' +
      '  iad1 (Washington) → Dublin   no database 189ms, one query 249ms, ~60ms per round trip\n' +
      '  dub1 (Dublin)     → Dublin   no database  89ms, one query  98ms,  ~9ms per round trip\n' +
      '\nMeasured with this script, which reuses the connection as a browser does:\n' +
      '  dub1 (Dublin)     → Dublin   no database  44ms, one query  52ms,  ~8ms per round trip\n' +
      '\nTwo tools, two numbers, both right. Compare like with like: a figure from\n' +
      'this script belongs beside another from this script.\n' +
      '\nA cold start is around 1.1s on the Hobby tier and shows up as the max above.\n' +
      'Check where the function ran with:  curl -sI ' + base + '/api/me | grep -i x-vercel-id',
  );
}

main().catch((error: unknown) => {
  console.error('Measurement failed:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
