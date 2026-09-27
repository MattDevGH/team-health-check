-- Requirements: 5.12; Slack Sign In NFR 1.5
--
-- Slack retries an interaction it believes failed, replaying the same payload.
-- The score upsert is keyed on member, session and question and so survives a
-- replay, but enqueuing the work twice would apply it twice and reply twice.
--
-- Nullable: entries queued by a failed outbound delivery have no interaction
-- behind them and nothing to be idempotent about. SQLite treats NULLs as
-- distinct in a unique index, so any number of those coexist.
ALTER TABLE "SlackInteractionQueue" ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "SlackInteractionQueue_idempotencyKey_key"
  ON "SlackInteractionQueue"("idempotencyKey");
