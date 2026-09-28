/**
 * Requirements: Deployment 3.8, 3.9
 *
 * The rule behind a deployment that refuses to serve when it is ahead of its
 * database. Kept pure so it can be exercised without a connection.
 */

import { describe, it, expect } from 'vitest';

import { findPendingMigrations, describePendingMigrations } from './pending';

const APPLIED = ['20260620233208_init', '20260621182618_add_pre_session_recipient'];

describe('findPendingMigrations', () => {
  it('finds nothing when the database is up to date', () => {
    expect(findPendingMigrations(APPLIED, APPLIED)).toEqual([]);
  });

  it('finds nothing when the database is ahead of the code', () => {
    // A rollback of the application, with the schema left forward. The extra
    // column is unused rather than missing, which nothing here needs to stop.
    expect(findPendingMigrations([APPLIED[0]!], APPLIED)).toEqual([]);
  });

  it('names the migration that has not been applied', () => {
    const committed = [...APPLIED, '20260926074240_add_response_finalised_at'];

    expect(findPendingMigrations(committed, APPLIED)).toEqual([
      '20260926074240_add_response_finalised_at',
    ]);
  });

  it('names every missing migration, in committed order', () => {
    // Exactly what production looked like on 2026-09-27
    const committed = [
      ...APPLIED,
      '20260926074240_add_response_finalised_at',
      '20260926120000_add_interaction_idempotency_key',
    ];

    expect(findPendingMigrations(committed, APPLIED)).toEqual([
      '20260926074240_add_response_finalised_at',
      '20260926120000_add_interaction_idempotency_key',
    ]);
  });

  /**
   * A branch merged late can carry a timestamp older than one already
   * applied. Comparing only the newest name would call that up to date.
   */
  it('notices a migration that sorts before one already applied', () => {
    const committed = [
      '20260620233208_init',
      '20260620999999_merged_late',
      '20260621182618_add_pre_session_recipient',
    ];

    expect(findPendingMigrations(committed, APPLIED)).toEqual(['20260620999999_merged_late']);
  });

  it('treats an empty ledger as everything pending', () => {
    // A database that has never been migrated at all
    expect(findPendingMigrations(APPLIED, [])).toEqual(APPLIED);
  });

  it('finds nothing when there are no migrations to apply', () => {
    expect(findPendingMigrations([], APPLIED)).toEqual([]);
  });
});

describe('describePendingMigrations', () => {
  const message = describePendingMigrations(['20260926120000_add_interaction_idempotency_key']);

  it('names the migration, so the reader does not have to go and find it', () => {
    expect(message).toContain('20260926120000_add_interaction_idempotency_key');
  });

  it('gives the command that fixes it', () => {
    expect(message).toContain('scripts/migrate-production.ts');
  });

  it('says to verify afterwards rather than trusting the exit code', () => {
    // Deployment 3.6 exists because an exit code said yes once while a local
    // file had been migrated instead
    expect(message).toContain('scripts/verify-production.ts');
  });

  it('says what goes wrong if it is ignored', () => {
    expect(message).toMatch(/expects columns the database does not have/i);
  });
});
