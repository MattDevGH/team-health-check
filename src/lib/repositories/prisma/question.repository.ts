/**
 * Prisma-backed implementation of QuestionRepository.
 * Requirement 9.1: Fixed question set
 */

import type { PrismaClient } from '@/generated/prisma';
import type { Question } from '../entities';
import type { QuestionRepository } from '../types';

export class PrismaQuestionRepository implements QuestionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findAll(): Promise<Question[]> {
    const records = await this.prisma.question.findMany({
      orderBy: { displayOrder: 'asc' },
    });
    return records.map(r => ({
      id: r.id,
      title: r.title,
      description: r.description,
      displayOrder: r.displayOrder,
    }));
  }

  async findById(id: string): Promise<Question | null> {
    const record = await this.prisma.question.findUnique({ where: { id } });
    if (!record) return null;
    return {
      id: record.id,
      title: record.title,
      description: record.description,
      displayOrder: record.displayOrder,
    };
  }
}
