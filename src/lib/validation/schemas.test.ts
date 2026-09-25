import { describe, it, expect } from 'vitest';
import {
  createTeamSchema,
  addMemberSchema,
  submitResponseSchema,
  scheduleSchema,
  MAX_RESPONSES_PER_SUBMISSION,
} from './schemas';
import { QUESTIONS } from '../../../prisma/seed';

/** A submission of `count` entries, each naming a different question. */
function submissionOf(count: number) {
  return {
    sessionId: 's-1',
    responses: Array.from({ length: count }, (_unused, index) => ({
      questionId: `q-${index}`,
      score: 3,
    })),
  };
}

/**
 * Requirements: 4.11, 4.12
 *
 * The cap is the catalogue's size because a submission is one member answering
 * one session. Tying the two together here means growing the catalogue cannot
 * silently leave the cap behind.
 */
describe('how large a submission may be', () => {
  it('caps a submission at the number of questions that exist', () => {
    expect(MAX_RESPONSES_PER_SUBMISSION).toBe(QUESTIONS.length);
  });

  it('accepts a submission that answers every question', () => {
    expect(submitResponseSchema.safeParse(submissionOf(MAX_RESPONSES_PER_SUBMISSION)).success).toBe(true);
  });

  it('rejects one entry more than there are questions', () => {
    expect(submitResponseSchema.safeParse(submissionOf(MAX_RESPONSES_PER_SUBMISSION + 1)).success).toBe(false);
  });

  it('rejects a submission large enough to be an attack', () => {
    // Unbounded, each entry cost several database round trips from one request
    expect(submitResponseSchema.safeParse(submissionOf(10_000)).success).toBe(false);
  });

  it('rejects the same question answered twice', () => {
    const twice = {
      sessionId: 's-1',
      responses: [
        { questionId: 'q-delivering-value', score: 2 },
        { questionId: 'q-delivering-value', score: 5 },
      ],
    };

    // Two scores for one question from one member express no intention the
    // application can honour, and the old code applied whichever arrived last
    expect(submitResponseSchema.safeParse(twice).success).toBe(false);
  });

  it('rejects an empty question id', () => {
    const blank = { sessionId: 's-1', responses: [{ questionId: '', score: 3 }] };
    expect(submitResponseSchema.safeParse(blank).success).toBe(false);
  });
});

describe('createTeamSchema', () => {
  it('accepts a valid team name', () => {
    const result = createTeamSchema.safeParse({ name: 'My Team' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('My Team');
    }
  });

  it('trims whitespace from name', () => {
    const result = createTeamSchema.safeParse({ name: '  Trimmed  ' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Trimmed');
    }
  });

  it('rejects empty name', () => {
    const result = createTeamSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });

  it('rejects whitespace-only name', () => {
    const result = createTeamSchema.safeParse({ name: '   ' });
    expect(result.success).toBe(false);
  });

  it('rejects name longer than 100 characters', () => {
    const result = createTeamSchema.safeParse({ name: 'a'.repeat(101) });
    expect(result.success).toBe(false);
  });

  it('accepts name at exactly 100 characters', () => {
    const result = createTeamSchema.safeParse({ name: 'a'.repeat(100) });
    expect(result.success).toBe(true);
  });

  it('accepts optional description', () => {
    const result = createTeamSchema.safeParse({
      name: 'Team',
      description: 'A description',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.description).toBe('A description');
    }
  });

  it('accepts missing description', () => {
    const result = createTeamSchema.safeParse({ name: 'Team' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.description).toBeUndefined();
    }
  });

  it('rejects description longer than 500 characters', () => {
    const result = createTeamSchema.safeParse({
      name: 'Team',
      description: 'x'.repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it('accepts description at exactly 500 characters', () => {
    const result = createTeamSchema.safeParse({
      name: 'Team',
      description: 'x'.repeat(500),
    });
    expect(result.success).toBe(true);
  });
});

describe('addMemberSchema', () => {
  it('accepts a valid member name', () => {
    const result = addMemberSchema.safeParse({ name: 'John Doe' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('John Doe');
    }
  });

  it('trims whitespace from name', () => {
    const result = addMemberSchema.safeParse({ name: '  Jane  ' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Jane');
    }
  });

  it('rejects empty name', () => {
    const result = addMemberSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });

  it('rejects whitespace-only name', () => {
    const result = addMemberSchema.safeParse({ name: '   ' });
    expect(result.success).toBe(false);
  });

  it('rejects name longer than 100 characters', () => {
    const result = addMemberSchema.safeParse({ name: 'a'.repeat(101) });
    expect(result.success).toBe(false);
  });

  it('accepts valid email', () => {
    const result = addMemberSchema.safeParse({
      name: 'John',
      email: 'john@example.com',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('john@example.com');
    }
  });

  it('accepts missing email', () => {
    const result = addMemberSchema.safeParse({ name: 'John' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBeUndefined();
    }
  });

  it('rejects invalid email format', () => {
    const result = addMemberSchema.safeParse({
      name: 'John',
      email: 'not-an-email',
    });
    expect(result.success).toBe(false);
  });

  it('rejects email without domain', () => {
    const result = addMemberSchema.safeParse({
      name: 'John',
      email: 'user@',
    });
    expect(result.success).toBe(false);
  });
});

describe('submitResponseSchema', () => {
  it('accepts valid responses', () => {
    const result = submitResponseSchema.safeParse({
      sessionId: 'session-1',
      responses: [
        { questionId: 'q-1', score: 3 },
        { questionId: 'q-2', score: 5, trendIndicator: 'improving' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty responses array', () => {
    const result = submitResponseSchema.safeParse({ sessionId: 'session-1', responses: [] });
    expect(result.success).toBe(false);
  });

  it('rejects missing sessionId', () => {
    const result = submitResponseSchema.safeParse({
      responses: [{ questionId: 'q-1', score: 3 }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects score below 1', () => {
    const result = submitResponseSchema.safeParse({
      sessionId: 'session-1',
      responses: [{ questionId: 'q-1', score: 0 }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects score above 5', () => {
    const result = submitResponseSchema.safeParse({
      sessionId: 'session-1',
      responses: [{ questionId: 'q-1', score: 6 }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer score', () => {
    const result = submitResponseSchema.safeParse({
      sessionId: 'session-1',
      responses: [{ questionId: 'q-1', score: 3.5 }],
    });
    expect(result.success).toBe(false);
  });

  it('accepts score at boundary 1', () => {
    const result = submitResponseSchema.safeParse({
      sessionId: 'session-1',
      responses: [{ questionId: 'q-1', score: 1 }],
    });
    expect(result.success).toBe(true);
  });

  it('accepts score at boundary 5', () => {
    const result = submitResponseSchema.safeParse({
      sessionId: 'session-1',
      responses: [{ questionId: 'q-1', score: 5 }],
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid trend indicators', () => {
    const indicators = ['improving', 'stable', 'declining'] as const;
    for (const trendIndicator of indicators) {
      const result = submitResponseSchema.safeParse({
        sessionId: 'session-1',
        responses: [{ questionId: 'q-1', score: 3, trendIndicator }],
      });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid trend indicator', () => {
    const result = submitResponseSchema.safeParse({
      sessionId: 'session-1',
      responses: [{ questionId: 'q-1', score: 3, trendIndicator: 'bad' }],
    });
    expect(result.success).toBe(false);
  });

  it('accepts missing trend indicator', () => {
    const result = submitResponseSchema.safeParse({
      sessionId: 'session-1',
      responses: [{ questionId: 'q-1', score: 3 }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.responses[0].trendIndicator).toBeUndefined();
    }
  });
});

describe('scheduleSchema', () => {
  it('accepts a valid schedule', () => {
    const result = scheduleSchema.safeParse({
      cadence: 'weekly',
      openDay: 1,
      openTime: '09:00',
      closeDay: 5,
      closeTime: '17:00',
      timezone: 'Europe/London',
    });
    expect(result.success).toBe(true);
  });

  it('defaults timezone to Europe/London', () => {
    const result = scheduleSchema.safeParse({
      cadence: 'weekly',
      openDay: 1,
      openTime: '09:00',
      closeDay: 5,
      closeTime: '17:00',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.timezone).toBe('Europe/London');
    }
  });

  it('rejects invalid cadence', () => {
    const result = scheduleSchema.safeParse({
      cadence: 'daily',
      openDay: 1,
      openTime: '09:00',
      closeDay: 5,
      closeTime: '17:00',
    });
    expect(result.success).toBe(false);
  });

  it('rejects openDay below 0', () => {
    const result = scheduleSchema.safeParse({
      cadence: 'weekly',
      openDay: -1,
      openTime: '09:00',
      closeDay: 5,
      closeTime: '17:00',
    });
    expect(result.success).toBe(false);
  });

  it('rejects openDay above 6', () => {
    const result = scheduleSchema.safeParse({
      cadence: 'weekly',
      openDay: 7,
      openTime: '09:00',
      closeDay: 5,
      closeTime: '17:00',
    });
    expect(result.success).toBe(false);
  });

  it('rejects closeDay below 0', () => {
    const result = scheduleSchema.safeParse({
      cadence: 'weekly',
      openDay: 1,
      openTime: '09:00',
      closeDay: -1,
      closeTime: '17:00',
    });
    expect(result.success).toBe(false);
  });

  it('rejects closeDay above 6', () => {
    const result = scheduleSchema.safeParse({
      cadence: 'weekly',
      openDay: 1,
      openTime: '09:00',
      closeDay: 7,
      closeTime: '17:00',
    });
    expect(result.success).toBe(false);
  });

  it('accepts valid time format HH:MM', () => {
    const result = scheduleSchema.safeParse({
      cadence: 'weekly',
      openDay: 0,
      openTime: '00:00',
      closeDay: 6,
      closeTime: '23:59',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid time format', () => {
    const result = scheduleSchema.safeParse({
      cadence: 'weekly',
      openDay: 1,
      openTime: '9:00',
      closeDay: 5,
      closeTime: '17:00',
    });
    expect(result.success).toBe(false);
  });

  it('rejects time with seconds', () => {
    const result = scheduleSchema.safeParse({
      cadence: 'weekly',
      openDay: 1,
      openTime: '09:00:00',
      closeDay: 5,
      closeTime: '17:00',
    });
    expect(result.success).toBe(false);
  });

  it('accepts day boundaries 0 and 6', () => {
    const result = scheduleSchema.safeParse({
      cadence: 'weekly',
      openDay: 0,
      openTime: '09:00',
      closeDay: 6,
      closeTime: '17:00',
    });
    expect(result.success).toBe(true);
  });

  it('rejects non-integer day values', () => {
    const result = scheduleSchema.safeParse({
      cadence: 'weekly',
      openDay: 1.5,
      openTime: '09:00',
      closeDay: 5,
      closeTime: '17:00',
    });
    expect(result.success).toBe(false);
  });
});
