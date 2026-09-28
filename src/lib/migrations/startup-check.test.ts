/**
 * Requirements: Deployment 3.8, 3.9
 *
 * The guard that would have caught the 2026-09-27 incident: two migrations
 * merged and deployed, never applied, and every scheduler tick returning 500
 * for two days while the application served requests happily.
 *
 * These assert what the guard does — start, or refuse and say why — rather
 * than that it queried something.
 */

import { describe, it, expect, vi } from 'vitest';

import { assertMigrationsApplied, type LedgerReader } from './startup-check';

const COMMITTED = ['20260620233208_init', '20260926120000_add_interaction_idempotency_key'];

/** A ledger holding exactly these migration names. */
function ledgerHolding(...names: string[]): () => LedgerReader {
  return () => ({
    async execute() {
      return { rows: names.map(name => ({ name })) };
    },
  });
}

/** A ledger that cannot be read at all. */
function unreachableLedger(message = 'connection refused'): () => LedgerReader {
  return () => ({
    async execute(): Promise<{ rows: Array<Record<string, unknown>> }> {
      throw new Error(message);
    },
  });
}

describe('when the database is up to date', () => {
  it('starts', async () => {
    await expect(
      assertMigrationsApplied({ openLedger: ledgerHolding(...COMMITTED), committed: COMMITTED }),
    ).resolves.toBeUndefined();
  });

  it('starts when the database is ahead of the code', async () => {
    // An application rolled back with the schema left forward
    await expect(
      assertMigrationsApplied({
        openLedger: ledgerHolding(...COMMITTED, '20261001000000_from_the_future'),
        committed: COMMITTED,
      }),
    ).resolves.toBeUndefined();
  });
});

/** Requirement 3.8 */
describe('when the database is behind', () => {
  it('refuses to start', async () => {
    await expect(
      assertMigrationsApplied({
        openLedger: ledgerHolding('20260620233208_init'),
        committed: COMMITTED,
      }),
    ).rejects.toThrow();
  });

  it('names the migration that is missing', async () => {
    await expect(
      assertMigrationsApplied({
        openLedger: ledgerHolding('20260620233208_init'),
        committed: COMMITTED,
      }),
    ).rejects.toThrow(/20260926120000_add_interaction_idempotency_key/);
  });

  it('says how to fix it, because the reader is looking at a failed deploy', async () => {
    await expect(
      assertMigrationsApplied({
        openLedger: ledgerHolding('20260620233208_init'),
        committed: COMMITTED,
      }),
    ).rejects.toThrow(/scripts\/migrate-production\.ts/);
  });
});

/**
 * Requirement 3.9
 *
 * A guard that fails more often than the fault it prevents is not worth
 * having. A missing migration is permanent; an unreachable database is not.
 */
describe('when the ledger cannot be read', () => {
  it('starts rather than turning a blip into an outage', async () => {
    await expect(
      assertMigrationsApplied({ openLedger: unreachableLedger(), committed: COMMITTED }),
    ).resolves.toBeUndefined();
  });

  it('says that the schema went unchecked, and why it started anyway', async () => {
    const log = vi.fn();

    await assertMigrationsApplied({
      openLedger: unreachableLedger('ECONNREFUSED'),
      committed: COMMITTED,
      log,
    });

    const said = log.mock.calls.map(call => String(call[0])).join('\n');
    expect(said).toContain('ECONNREFUSED');
    expect(said).toMatch(/not checked|was not checked/i);
  });

  /**
   * A database that has never been migrated has no ledger table, which reads
   * as an error rather than an empty list. Refusing would stop a first deploy
   * from ever starting — the one case where the operator is already there.
   */
  it('starts on a database that has never been migrated at all', async () => {
    await expect(
      assertMigrationsApplied({
        openLedger: unreachableLedger('no such table: _applied_migration'),
        committed: COMMITTED,
      }),
    ).resolves.toBeUndefined();
  });
});

describe('when there is nothing to check', () => {
  it('does not open a connection at all', async () => {
    const openLedger = vi.fn();

    await assertMigrationsApplied({ committed: COMMITTED });

    expect(openLedger).not.toHaveBeenCalled();
  });
});
