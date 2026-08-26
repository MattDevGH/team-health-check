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

export interface AuditService {
  log(entry: {
    teamId: string;
    changeType: string;
    previousValue: string;
    newValue: string;
    userId: string;
  }): Promise<void>;
  getLog(teamId: string, pagination?: { cursor?: string; limit?: number }): Promise<AuditLogEntry[]>;
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
   * Retrieve audit log entries for a team.
   * Returns entries in reverse chronological order (most recent first).
   * Supports cursor-based pagination.
   * Requirement 18.4, 18.5
   */
  async function getLog(
    teamId: string,
    pagination?: { cursor?: string; limit?: number }
  ): Promise<AuditLogEntry[]> {
    return auditLogRepo.findByTeamId(teamId, pagination);
  }

  return { log, getLog };
}
