// @vitest-environment node

/**
 * An instrument for counting database queries.
 *
 * Requirements: Feeling Responsive 4.2
 *
 * The application was slow because a page load issued about nineteen database
 * queries and nothing in a 1614-test suite could say so. This counts them, so
 * that the budgets in the rest of this milestone have something to stand on.
 *
 * Counted through Prisma's query event over the libSQL driver adapter, which is
 * production's path, against a real temporary file. Verified empirically before
 * it was designed around: the event fires exactly once per statement sent.
 *
 * **The counter is tested before it is trusted.** A counter wired to nothing
 * reports zero and passes every budget ever set against it, which is the most
 * comfortable way imaginable to be wrong about performance.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createCountedDatabase, type CountedDatabase } from './support/counted-database';

let db: CountedDatabase;

beforeAll(async () => {
  db = await createCountedDatabase();
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe('the query counter', () => {
  it('reports a known count for a known operation', async () => {
    const count = await db.countQueries(async () => {
      await db.prisma.team.create({ data: { name: 'One Insert', timezone: 'Europe/London' } });
    });

    expect(count).toBe(1);
  });

  it('counts each statement, not each call that happens to touch the database', async () => {
    const count = await db.countQueries(async () => {
      const team = await db.prisma.team.create({ data: { name: 'Two', timezone: 'Europe/London' } });
      await db.prisma.team.findUnique({ where: { id: team.id } });
    });

    expect(count).toBe(2);
  });

  it('reports zero for work that touches no database', async () => {
    /*
     * The case that makes every later budget vacuous if it is wrong. A counter
     * that has come unwired reports zero, passes every budget, and says the
     * application is fast while it crawls.
     */
    const count = await db.countQueries(async () => {
      await Promise.resolve('no queries here');
    });

    expect(count).toBe(0);
  });

  it('does not carry one measurement into the next', async () => {
    await db.countQueries(async () => {
      await db.prisma.team.create({ data: { name: 'First', timezone: 'Europe/London' } });
      await db.prisma.team.create({ data: { name: 'Second', timezone: 'Europe/London' } });
    });

    const second = await db.countQueries(async () => {
      await db.prisma.team.create({ data: { name: 'Third', timezone: 'Europe/London' } });
    });

    expect(second).toBe(1);
  });

  it('returns what the measured work returned, so a measurement is not a detour', async () => {
    // A counter that swallows the result forces every caller to reach around it
    const { result, queries } = await db.measure(async () => {
      const team = await db.prisma.team.create({ data: { name: 'Returned', timezone: 'Europe/London' } });
      return team.name;
    });

    expect(result).toBe('Returned');
    expect(queries).toBe(1);
  });

  it('counts the statements inside a transaction rather than the transaction', async () => {
    /*
     * An interactive transaction sends BEGIN and COMMIT of its own. Those are
     * real statements and real round trips, so they are counted — a budget that
     * ignored them would understate exactly the work that costs the most.
     */
    const count = await db.countQueries(async () => {
      await db.prisma.$transaction(async tx => {
        await tx.team.create({ data: { name: 'In a transaction', timezone: 'Europe/London' } });
      });
    });

    expect(count).toBeGreaterThan(1);
  });

  it('applied the schema, so a count of zero cannot mean an empty database', async () => {
    // Guards the fixture: every count above would be zero against no schema
    const teams = await db.prisma.team.count();

    expect(teams).toBeGreaterThan(0);
  });
});

describe('the first measurement of a run', () => {
  it('is not charged for opening the connection', async () => {
    /*
     * A lazily opened connection can send statements of its own. If those land
     * inside the first measurement, the first budget in a run is inflated and
     * the rest are not — which reads as one flaky test rather than as an
     * instrument that cannot be trusted.
     *
     * A database of its own, because every other test in this file has already
     * warmed the shared one.
     */
    const fresh = await createCountedDatabase();

    try {
      const count = await fresh.countQueries(async () => {
        await fresh.prisma.team.create({ data: { name: 'Cold', timezone: 'Europe/London' } });
      });

      expect(count).toBe(1);
    } finally {
      await fresh.close();
    }
  }, 60_000);
});
