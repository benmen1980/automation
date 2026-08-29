ALTER TABLE "Integration" ADD COLUMN "assignedUserUid" TEXT;

UPDATE "Integration"
SET "assignedUserUid" = (
  SELECT "userUid" FROM "User" WHERE "User"."id" = "Integration"."userId"
)
WHERE "assignedUserUid" IS NULL;
