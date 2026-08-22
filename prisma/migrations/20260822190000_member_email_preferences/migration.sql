-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "notifyVacancies" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyBirthday" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyAssessments" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "emailOptOutAt" TIMESTAMP(3);
