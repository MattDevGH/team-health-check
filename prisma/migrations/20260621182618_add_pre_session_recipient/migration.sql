-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Team" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "privacyMode" TEXT NOT NULL DEFAULT 'anonymous',
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "slackDeliveryStart" TEXT,
    "slackDeliveryEnd" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/London',
    "preSessionRecipient" TEXT NOT NULL DEFAULT 'delivery_manager',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Team" ("archived", "createdAt", "description", "id", "name", "privacyMode", "slackDeliveryEnd", "slackDeliveryStart", "timezone", "updatedAt") SELECT "archived", "createdAt", "description", "id", "name", "privacyMode", "slackDeliveryEnd", "slackDeliveryStart", "timezone", "updatedAt" FROM "Team";
DROP TABLE "Team";
ALTER TABLE "new_Team" RENAME TO "Team";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
