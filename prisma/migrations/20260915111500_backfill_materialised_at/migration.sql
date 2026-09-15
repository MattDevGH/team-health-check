-- Sessions that closed before materialisedAt existed.
--
-- The column records that aggregation ran. Rows written before it existed carry
-- NULL whether or not the work happened, and for a session nobody answered
-- there is no output to infer it from — so the dashboard would report that the
-- scheduler may not be running, about a check that closed exactly as it should.
-- Production had such a row: closed 2026-09-14, no responses, materialised by a
-- tick that left no trace of itself.
--
-- The cutoff is when the column was added. Every closed session older than that
-- has had its chance to be materialised; anything closing afterwards records
-- its own time and must not be claimed for, because a check that closed a
-- minute ago has results still on their way.
--
-- actualCloseAt rather than a fixed value, so the recorded time stays close to
-- the truth. Skips rows that already carry one, which makes a second run a
-- no-op, as every migration here must be.
UPDATE "HealthCheckSession"
SET "materialisedAt" = "actualCloseAt"
WHERE "materialisedAt" IS NULL
  AND "status" = 'closed'
  AND "actualCloseAt" IS NOT NULL
  AND datetime("actualCloseAt") < datetime('2026-09-15T11:14:01Z');
