import type { PrismaClient, HealthCheckSession as PrismaHealthCheckSession } from '@/generated/prisma';
import type { HealthCheckSession } from '../entities';
import type { SessionRepository } from '../types';
import { NotFoundError } from '../../errors';

/**
 * Prisma-backed implementation of SessionRepository.
 * Requirements: 3.2 (session lifecycle)
 */
export class PrismaSessionRepository implements SessionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: {
    teamId: string;
    status: string;
    actualOpenAt?: Date;
    scheduledOpenAt?: Date;
    scheduledCloseAt?: Date;
  }): Promise<HealthCheckSession> {
    const record = await this.prisma.healthCheckSession.create({
      data: {
        teamId: data.teamId,
        status: data.status,
        /*
         * Passed through when the caller has a clock. The column defaults to
         * now() in the schema, so omitting it keeps the previous behaviour —
         * but a caller that was given a clock should not be overruled by the
         * database, and the scheduler reads this field to decide whether a
         * cycle has already been served.
         */
        ...(data.actualOpenAt ? { actualOpenAt: data.actualOpenAt } : {}),
        scheduledOpenAt: data.scheduledOpenAt ?? null,
        scheduledCloseAt: data.scheduledCloseAt ?? null,
      },
    });
    return this.mapToEntity(record);
  }

  async findById(id: string): Promise<HealthCheckSession | null> {
    const record = await this.prisma.healthCheckSession.findUnique({ where: { id } });
    return record ? this.mapToEntity(record) : null;
  }

  async findOpenByTeamId(teamId: string): Promise<HealthCheckSession | null> {
    const record = await this.prisma.healthCheckSession.findFirst({
      where: { teamId, status: 'open' },
    });
    return record ? this.mapToEntity(record) : null;
  }

  async findByTeamId(teamId: string): Promise<HealthCheckSession[]> {
    const records = await this.prisma.healthCheckSession.findMany({
      where: { teamId },
      orderBy: { createdAt: 'desc' },
    });
    return records.map((r) => this.mapToEntity(r));
  }

  /**
   * Requirements: NFR 3.5, NFR 3.6
   *
   * Records everything materialising a session produces, as one outcome: the
   * aggregate rows and the timestamp saying the work was done.
   *
   * It lives on the session repository rather than the aggregate one because
   * atomicity has to have a single owner — the two tables are written in one
   * transaction, and a transaction cannot span two clients.
   *
   * Deletes the session's existing aggregates first, inside the same
   * transaction, which is what makes a retry possible. `(sessionId,
   * questionId)` is unique, so an attempt that failed after writing some rows
   * would otherwise collide with itself for ever.
   */
  async materialise(
    sessionId: string,
    aggregates: Array<{
      questionId: string;
      averageScore: number;
      responseCount: number;
      improvingCount: number;
      stableCount: number;
      decliningCount: number;
    }>,
    at: Date,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.sessionAggregate.deleteMany({ where: { sessionId } });

      for (const aggregate of aggregates) {
        await tx.sessionAggregate.create({ data: { sessionId, ...aggregate } });
      }

      /*
       * Set last, inside the same transaction.
       *
       * A check nobody answered produces zero aggregates, which is
       * indistinguishable from never having been computed — so the timestamp
       * is the only thing that says the work happened, and it must not survive
       * a rollback of the rows it describes.
       */
      await tx.healthCheckSession.update({
        where: { id: sessionId },
        data: { materialisedAt: at },
      });
    });
  }

  async update(
    id: string,
    // Matches the interface. These were narrower than the contract they
    // implement, which TypeScript permits for methods and which meant
    // `materialisedAt` was accepted at runtime while being undeclared here.
    data: Partial<Pick<HealthCheckSession, 'status' | 'actualCloseAt' | 'materialisedAt'>>
  ): Promise<HealthCheckSession> {
    const existing = await this.prisma.healthCheckSession.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError(`Session not found: ${id}`);
    }

    const record = await this.prisma.healthCheckSession.update({
      where: { id },
      data,
    });
    return this.mapToEntity(record);
  }

  private mapToEntity(record: PrismaHealthCheckSession): HealthCheckSession {
    return {
      id: record.id,
      teamId: record.teamId,
      status: record.status,
      scheduledOpenAt: record.scheduledOpenAt,
      scheduledCloseAt: record.scheduledCloseAt,
      actualOpenAt: record.actualOpenAt,
      actualCloseAt: record.actualCloseAt,
      materialisedAt: record.materialisedAt,
      createdAt: record.createdAt,
    };
  }
}
