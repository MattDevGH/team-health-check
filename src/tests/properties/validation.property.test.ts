import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  createTeamSchema,
  addMemberSchema,
  submitResponseSchema,
} from '@/lib/validation/schemas';

/**
 * Generates a string composed entirely of whitespace characters.
 * Used to validate that whitespace-only team names are rejected.
 */
const whitespaceOnlyArb = fc
  .array(fc.constantFrom(' ', '\t', '\n', '\r', '\f', '\v'), { minLength: 1, maxLength: 100 })
  .map((chars) => chars.join(''));

/**
 * Generates a valid email that conforms to Zod's email validator:
 * alphanumeric local part (no leading/trailing dots, no consecutive dots) + @ + valid domain.
 */
const zodCompatibleEmailArb = fc
  .tuple(
    fc.stringMatching(/^[a-z][a-z0-9]{0,19}$/, { size: 'small' }),
    fc.domain()
  )
  .map(([local, domain]) => `${local}@${domain}`);

describe('Validation Schema Properties', () => {
  // Validates: Requirement 1.2
  describe('Property 2: Whitespace-only team names are rejected', () => {
    it('rejects any string composed entirely of whitespace characters', () => {
      fc.assert(
        fc.property(whitespaceOnlyArb, (whitespaceOnly) => {
          const result = createTeamSchema.safeParse({ name: whitespaceOnly });
          expect(result.success).toBe(false);
        })
      );
    });

    it('rejects the empty string as a team name', () => {
      const result = createTeamSchema.safeParse({ name: '' });
      expect(result.success).toBe(false);
    });
  });

  // Validates: Requirement 1.4
  describe('Property 3: Invalid emails are rejected, valid emails are accepted', () => {
    it('rejects strings without an @ symbol as emails', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter((s) => !s.includes('@')),
          (invalidEmail) => {
            const result = addMemberSchema.safeParse({
              name: 'Valid Name',
              email: invalidEmail,
            });
            expect(result.success).toBe(false);
          }
        )
      );
    });

    it('rejects strings with @ but no domain part', () => {
      fc.assert(
        fc.property(
          fc.stringMatching(/^[a-z][a-z0-9]{0,19}$/, { size: 'small' }),
          (localPart) => {
            const result = addMemberSchema.safeParse({
              name: 'Valid Name',
              email: `${localPart}@`,
            });
            expect(result.success).toBe(false);
          }
        )
      );
    });

    it('rejects strings with @ but missing local part', () => {
      fc.assert(
        fc.property(fc.domain(), (domain) => {
          const result = addMemberSchema.safeParse({
            name: 'Valid Name',
            email: `@${domain}`,
          });
          expect(result.success).toBe(false);
        })
      );
    });

    it('accepts valid email addresses', () => {
      fc.assert(
        fc.property(zodCompatibleEmailArb, (validEmail) => {
          const result = addMemberSchema.safeParse({
            name: 'Valid Name',
            email: validEmail,
          });
          expect(result.success).toBe(true);
        })
      );
    });

    it('accepts requests without an email (email is optional)', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }).filter(
            (s) => s.trim().length > 0
          ),
          (name) => {
            const result = addMemberSchema.safeParse({ name });
            expect(result.success).toBe(true);
          }
        )
      );
    });
  });

  // Validates: Requirements 4.4, 4.5, 5.6, 5.7
  describe('Property 11: Score validation — accept [1,5], reject outside', () => {
    it('accepts integer scores between 1 and 5 inclusive', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 5 }),
          (validScore) => {
            const result = submitResponseSchema.safeParse({
              responses: [
                {
                  questionId: 'q-delivering-value',
                  score: validScore,
                },
              ],
            });
            expect(result.success).toBe(true);
          }
        )
      );
    });

    it('rejects integer scores less than 1', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: -1000, max: 0 }),
          (tooLow) => {
            const result = submitResponseSchema.safeParse({
              responses: [
                {
                  questionId: 'q-delivering-value',
                  score: tooLow,
                },
              ],
            });
            expect(result.success).toBe(false);
          }
        )
      );
    });

    it('rejects integer scores greater than 5', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 6, max: 1000 }),
          (tooHigh) => {
            const result = submitResponseSchema.safeParse({
              responses: [
                {
                  questionId: 'q-delivering-value',
                  score: tooHigh,
                },
              ],
            });
            expect(result.success).toBe(false);
          }
        )
      );
    });

    it('rejects non-integer (floating point) scores', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 1.01, max: 4.99, noNaN: true, noDefaultInfinity: true }).filter(
            (n) => !Number.isInteger(n)
          ),
          (floatScore) => {
            const result = submitResponseSchema.safeParse({
              responses: [
                {
                  questionId: 'q-delivering-value',
                  score: floatScore,
                },
              ],
            });
            expect(result.success).toBe(false);
          }
        )
      );
    });
  });
});
