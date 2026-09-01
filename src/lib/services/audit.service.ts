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

import type { AuditLogRepository, TeamMemberRepository } from '@/lib/repositories/types';
import type { AuditLogEntry } from '@/lib/repositories/entities';

export interface AuditServiceDeps {
  auditLogRepo: AuditLogRepository;
  teamMemberRepo: TeamMemberRepository;
}

/**
 * Who made a change, resolved at read time.
 *
 * The log stores an id and keeps storing it: it is append-only history, and a
 * name captured at write time would go stale the moment someone was renamed.
 * Resolution belongs on the way out.
 */
export interface AuditActor {
  /** The stored value, unchanged. */
  id: string;
  /** The member's name, or null when they can no longer be identified. */
  name: string | null;
  /** True when the actor is the member reading the log. */
  isViewer: boolean;
  /**
   * True for the `deleted:<hash>` form written by the GDPR erasure path.
   *
   * Deliberately never resolved: the hash exists so the actor cannot be
   * identified, and resolving it would defeat the erasure it records.
   */
  isErased: boolean;
}

/** An audit entry with its actor resolved. */
export type AttributedAuditLogEntry = AuditLogEntry & { actor: AuditActor };

/** Prefix written by the data-deletion path in `response.service`. */
const ERASED_PREFIX = 'deleted:';

/**
 * A page of audit entries plus the cursor to continue from.
 *
 * `nextCursor` is null when this page is the end of the log. Returning the
 * entries alone would make cursor pagination unusable by any client: the
 * repository supports `cursor`, but nothing could ever discover what to pass.
 */
export interface AuditLogPage {
  entries: AttributedAuditLogEntry[];
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
  getLog(
    teamId: string,
    pagination?: { cursor?: string; limit?: number },
    viewerId?: string,
  ): Promise<AuditLogPage>;
}

/**
 * Factory function for the audit service.
 * Accepts repository dependencies via injection.
 * Deliberately exposes only `log` (append) and `getLog` (read) —
 * no modify or delete operations per Requirement 18.3.
 */
/**
 * Resolves one stored actor id.
 *
 * Order matters: erasure is checked before the name lookup, so a `deleted:`
 * value can never be resolved even if something else in the team happened to
 * share its id.
 */
function resolveActor(
  userId: string,
  namesById: Map<string, string>,
  viewerId?: string,
): AuditActor {
  if (userId.startsWith(ERASED_PREFIX)) {
    return { id: userId, name: null, isViewer: false, isErased: true };
  }

  return {
    id: userId,
    name: namesById.get(userId) ?? null,
    isViewer: viewerId !== undefined && userId === viewerId,
    isErased: false,
  };
}

export function createAuditService(deps: AuditServiceDeps): AuditService {
  const { auditLogRepo, teamMemberRepo } = deps;

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
    pagination?: { cursor?: string; limit?: number },
    viewerId?: string,
  ): Promise<AuditLogPage> {
    const limit = pagination?.limit ?? DEFAULT_AUDIT_PAGE_SIZE;
    const entries = await auditLogRepo.findByTeamId(teamId, { ...pagination, limit });

    // One lookup for the page, not one per entry: a log of fifty changes by two
    // people is still two people
    const members = await teamMemberRepo.findByTeamId(teamId);
    const namesById = new Map(members.map((member) => [member.id, member.name]));

    const attributed = entries.map((entry) => ({
      ...entry,
      actor: resolveActor(entry.userId, namesById, viewerId),
    }));

    const nextCursor = entries.length === limit ? entries[entries.length - 1].id : null;

    return { entries: attributed, nextCursor };
  }

  return { log, getLog };
}
