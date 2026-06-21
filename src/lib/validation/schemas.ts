import { z } from 'zod';

export const createTeamSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().max(500).optional(),
});

export const addMemberSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().email().optional(),
});

export const submitResponseSchema = z.object({
  responses: z
    .array(
      z.object({
        questionId: z.string(),
        score: z.number().int().min(1).max(5),
        trendIndicator: z.enum(['improving', 'stable', 'declining']).optional(),
      })
    )
    .min(1),
});

export const scheduleSchema = z.object({
  cadence: z.enum(['weekly']),
  openDay: z.number().int().min(0).max(6),
  openTime: z.string().regex(/^\d{2}:\d{2}$/),
  closeDay: z.number().int().min(0).max(6),
  closeTime: z.string().regex(/^\d{2}:\d{2}$/),
  timezone: z.string().default('Europe/London'),
});

export type CreateTeamInput = z.infer<typeof createTeamSchema>;
export type AddMemberInput = z.infer<typeof addMemberSchema>;
export type SubmitResponseInput = z.infer<typeof submitResponseSchema>;
export type ScheduleInput = z.infer<typeof scheduleSchema>;
