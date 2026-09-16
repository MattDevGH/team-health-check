-- CreateTable
-- Additive: nothing existing is altered, so a deployed application keeps
-- working against the previous schema until it is replaced.
CREATE TABLE "SchedulerHeartbeat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tickId" TEXT NOT NULL,
    "ranAt" DATETIME NOT NULL,
    "summary" TEXT NOT NULL,
    "opened" INTEGER NOT NULL,
    "closed" INTEGER NOT NULL,
    "materialised" INTEGER NOT NULL,
    "prompts" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL
);
