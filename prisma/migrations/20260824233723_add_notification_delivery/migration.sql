-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "memberId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "NotificationDelivery_sessionId_type_idx" ON "NotificationDelivery"("sessionId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDelivery_memberId_sessionId_type_key" ON "NotificationDelivery"("memberId", "sessionId", "type");
