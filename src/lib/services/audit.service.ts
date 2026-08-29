/**
 * Audit log service — append-only, immutable team configuration history.
 * Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 18.6
 *
 * Key constraints:
 * - Append-only: only `log` writes entries
 * - Immutable: no update or delete operations exposed
 * - Read-only retrieval via `getLog` (most recent first)
 * - Entries never contain individual response scores
 */

import type { AuditLogRepository } from '@/lib/repositories/types';
import type { AuditLogEntry } from '@/lib/repositories/entities';

export interface AuditServiceDeps {
  auditLogRepo: AuditLogRepository;
}

/**
 * A page of audit entries plus the cursor to continue from.
 *
 * `nextCursor` is null when this page is the end of the log. Returning the
 * entries alone would make cursor pagination unusable by any client: the
 * repository supports `cursor`, but nothing could ever discover what to pass.
 */
export interface AuditLogPage {
  entries: AuditLogEntry[];
  nextCursor: string | null;
}

/** Entries per page when a caller does not ask for a specific limit. */
export const DEFAULT_AUDIT_PAGE_SIZE = 50;

export interface AuditService {
  log(entry: {
    teamId: string;
    changeType: string;
    previousValue: string;
    newValue: string;
    userId: string;
  }): Promise<void>;
  getLog(teamId: string, pagination?: { cursor?: string; limit?: number }): Promise<AuditLogPage>;
}

/**
 * Factory function for the audit service.
 * Accepts repository dependencies via injection.
 * Deliberately exposes only `log` (append) and `getLog` (read) —
 * no modify or delete operations per Requirement 18.3.
 */
export function createAuditService(deps: AuditServiceDeps): AuditService {
  const { auditLogRepo } = deps;

  /**
   * Append a new audit log entry.
   * Stores changeType, previous/new values, userId, and UTC timestamp.
   * Requirement 18.1, 18.2
   */
  async function log(entry: {
    teamId: string;
    changeType: string;
    previousValue: string;
    newValue: string;
    userId: string;
  }): Promise<void> {
    await auditLogRepo.create(entry);
  }

  /**
   * Retrieve a page of audit log entries for a team.
   * Returns entries in reverse chronological order (most recent first).
   * Requirement 18.4, 18.5
   *
   * The limit is always passed explicitly so the page size is known here, and a
   * full page can be distinguished from the end of the log. A full page yields
   * a cursor; a short one means there is nothing after it.
   *
   * This can hand back a cursor for a log that happens to end on an exact page
   * boundary, costing one empty request. The alternative — fetching one extra
   * row to peek — reads a record the caller never asked for on every request.
   */
  async function getLog(
    teamId: string,
    pagination?: { cursor?: string; limit?: number }
  ): Promise<AuditLogPage> {
    const limit = pagination?.limit ?? DEFAULT_AUDIT_PAGE_SIZE;
    const entries = await auditLogRepo.findByTeamId(teamId, { ...pagination, limit });

    const nextCursor = entries.length === limit ? entries[entries.length - 1].id : null;

    return { entries, nextCursor };
  }

  return { log, getLog };
}
