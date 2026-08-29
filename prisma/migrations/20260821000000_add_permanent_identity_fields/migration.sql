ALTER TABLE "User" ADD COLUMN "userUid" TEXT;

ALTER TABLE "Integration" ADD COLUMN "automationId" TEXT;

CREATE UNIQUE INDEX "User_userUid_key" ON "User"("userUid");

CREATE UNIQUE INDEX "Integration_automationId_key" ON "Integration"("automationId");
