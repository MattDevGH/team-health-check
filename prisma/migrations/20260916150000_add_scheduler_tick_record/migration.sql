-- CreateTable
-- Additive: creates a table and alters nothing, so the deployed application
-- keeps working against the previous schema until it is replaced.
CREATE TABLE "SchedulerTickRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tickId" TEXT NOT NULL,
    "ranAt" DATETIME NOT NULL,
    "summary" TEXT NOT NULL,
    "opened" INTEGER NOT NULL,
    "closed" INTEGER NOT NULL,
    "materialised" INTEGER NOT NULL,
    "prompts" INTEGER NOT NULL,
    "failures" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "reasons" TEXT NOT NULL
);

-- Serves the newest-first read and the ranged delete that prunes, so neither
-- becomes a scan over a table that grows for as long as nobody looks at it.
CREATE INDEX "SchedulerTickRecord_ranAt_idx" ON "SchedulerTickRecord"("ranAt");
