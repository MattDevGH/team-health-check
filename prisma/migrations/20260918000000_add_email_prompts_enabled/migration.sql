-- Whether a member wants health check prompts by email.
--
-- Requirements: Reaching Your Health Check 4.1, 4.3
--
-- Additive and nullable, so it applies to a live database with rows in it and
-- no member's existing setup changes. NULL is "has not chosen": the effective
-- answer is derived from whether Slack is linked, which a stored default could
-- not know at the time the row was written.
ALTER TABLE "TeamMember" ADD COLUMN "emailPromptsEnabled" BOOLEAN;
