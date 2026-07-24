-- CreateEnum
CREATE TYPE "LeadCloseType" AS ENUM ('EMBUDO', 'DIRECTO', 'ONLINE');

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "closeType" "LeadCloseType";
