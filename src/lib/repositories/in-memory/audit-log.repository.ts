/** Requirement 18.1: Audit log */
import type { AuditLogEntry } from '../entities';
import type { AuditLogRepository } from '../types';

export class InMemoryAuditLogRepository implements AuditLogRepository {
  private store = new Map<string, AuditLogEntry>();

  async create(entry: {
    teamId: string;
    changeType: string;
    previousValue: string;
    newValue: string;
    userId: string;
  }): Promise<AuditLogEntry> {
    const logEntry: AuditLogEntry = {
      id: crypto.randomUUID(),
      teamId: entry.teamId,
      changeType: entry.changeType,
      previousValue: entry.previousValue,
      newValue: entry.newValue,
      userId: entry.userId,
      timestamp: new Date(),
    };
    this.store.set(logEntry.id, logEntry);
    return logEntry;
  }

  async findByTeamId(
    teamId: string,
    pagination?: { cursor?: string; limit?: number }
  ): Promise<AuditLogEntry[]> {
    const limit = pagination?.limit ?? 50;
    const entries = [...this.store.values()]
      .filter(e => e.teamId === teamId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    if (!pagination?.cursor) {
      return entries.slice(0, limit);
    }

    const cursorIndex = entries.findIndex(e => e.id === pagination.cursor);
    if (cursorIndex === -1) return entries.slice(0, limit);
    return entries.slice(cursorIndex + 1, cursorIndex + 1 + limit);
  }
}
