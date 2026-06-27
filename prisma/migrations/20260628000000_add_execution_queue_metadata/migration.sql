ALTER TABLE "Execution" ADD COLUMN "retryCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Execution" ADD COLUMN "maxAttempts" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "Execution" ADD COLUMN "queueMessageId" TEXT;
ALTER TABLE "Execution" ADD COLUMN "queueUrl" TEXT;
ALTER TABLE "Execution" ADD COLUMN "cloudWatchLogRef" TEXT;
ALTER TABLE "Execution" ADD COLUMN "externalRequestId" TEXT;
