import { z } from 'zod';

export const createTeamSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().max(500).optional(),
});

export const genesisSchema = z.object({
  token: z.string().trim().min(1),
  teamName: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional(),
});

export const addMemberSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().email().optional(),
});

export const memberRoleSchema = z.object({
  role: z.enum(['delivery_manager', 'team_member']),
});

/**
 * A Slack user id a delivery manager is asserting, or null to clear it.
 *
 * Requirements: Slack Sign In 2.1
 *
 * Slack ids look like `U01ABCDE` — an upper-case letter followed by
 * alphanumerics. Constrained so a typed-in value that could never be a Slack
 * id is refused at the edge rather than stored and puzzled over later, and
 * bounded so the column cannot be used as free text.
 */
export const slackBindingSchema = z.object({
  slackUserId: z
    .string()
    .trim()
    .regex(/^[UW][A-Z0-9]{2,20}$/, 'That does not look like a Slack member ID')
    .nullable(),
});

/**
 * Requirements: 4.11, 4.12
 *
 * The number of questions in the catalogue. A submission is one member
 * answering one session, so it cannot honestly carry more entries than there
 * are questions to answer.
 *
 * Written here rather than read from the seed, which is not part of the
 * running application — `schemas.test.ts` asserts the two agree, so growing
 * the catalogue cannot quietly leave this behind.
 *
 * It was unbounded until 2026-09-25. Each entry costs several database round
 * trips, so one authenticated request could name as many as it liked and have
 * them all made.
 */
export const MAX_RESPONSES_PER_SUBMISSION = 5;

export const submitResponseSchema = z.object({
  sessionId: z.string().min(1),
  responses: z
    .array(
      z.object({
        questionId: z.string().min(1),
        score: z.number().int().min(1).max(5),
        trendIndicator: z.enum(['improving', 'stable', 'declining']).optional(),
      })
    )
    .min(1)
    .max(MAX_RESPONSES_PER_SUBMISSION)
    /**
     * Requirement 4.11. Two scores for one question from one member in one
     * session express no intention the application can honour, and the route
     * used to apply them in arrival order — so the answer kept was whichever
     * the sender happened to put last.
     */
    .refine(
      entries => new Set(entries.map(entry => entry.questionId)).size === entries.length,
      { message: 'Each question may be answered only once in a submission' },
    ),
});

export const scheduleSchema = z.object({
  cadence: z.enum(['weekly']),
  openDay: z.number().int().min(0).max(6),
  openTime: z.string().regex(/^\d{2}:\d{2}$/),
  closeDay: z.number().int().min(0).max(6),
  closeTime: z.string().regex(/^\d{2}:\d{2}$/),
  timezone: z.string().default('Europe/London'),
});

const deliveryTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
  .or(z.literal(''))
  .transform((value) => value || null)
  .optional();

export const updateTeamSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  privacyMode: z.enum(['anonymous', 'attributed']).optional(),
  slackDeliveryStart: deliveryTimeSchema,
  slackDeliveryEnd: deliveryTimeSchema,
});

export type CreateTeamInput = z.infer<typeof createTeamSchema>;
export type UpdateTeamInput = z.infer<typeof updateTeamSchema>;
export type AddMemberInput = z.infer<typeof addMemberSchema>;
export type SubmitResponseInput = z.infer<typeof submitResponseSchema>;
export type ScheduleInput = z.infer<typeof scheduleSchema>;
