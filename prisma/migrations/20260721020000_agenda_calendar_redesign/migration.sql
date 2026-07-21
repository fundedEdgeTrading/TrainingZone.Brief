-- CreateEnum
CREATE TYPE "SessionRecurrence" AS ENUM ('NONE', 'WEEKLY', 'WEEKDAYS');

-- AlterTable
ALTER TABLE "ClassSession" ADD COLUMN     "recurrence" "SessionRecurrence" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "recUntil" TIMESTAMP(3),
ADD COLUMN     "isTrial" BOOLEAN NOT NULL DEFAULT false;
