-- DropForeignKey
ALTER TABLE "Member" DROP CONSTRAINT "Member_trainerId_fkey";

-- DropIndex
DROP INDEX "Member_trainerId_idx";

-- AlterTable
ALTER TABLE "Member" DROP COLUMN "trainerId";
