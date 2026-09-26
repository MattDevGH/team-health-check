-- Requirements: 16.1, 18.2, 18.4
--
-- A response counts towards the rolling average only once its author can no
-- longer change it. Before this column existed, the average was computed over
-- live rows and handed back to the member who had just written one, so reading
-- it, changing an answer and reading it again gave the sum of everybody else's
-- scores.
--
-- AlterTable
ALTER TABLE "Response" ADD COLUMN "finalisedAt" DATETIME;

-- Backfill: a response in a closed session is already final, because nothing
-- can change it. Without this every historical response would drop out of the
-- averages the moment the column was introduced, and a team with a year of
-- history would be told it needs more responses.
--
-- `updatedAt` is the closest honest timestamp we hold for when the answer
-- settled. The session's `closedAt` would be later than the truth for answers
-- given days earlier, and `finalisedAt` is only ever compared against null.
UPDATE "Response"
SET "finalisedAt" = "updatedAt"
WHERE "sessionId" IN (
  SELECT "id" FROM "HealthCheckSession" WHERE "status" = 'closed'
);
