-- CreateEnum
CREATE TYPE "AnnouncementCategory" AS ENUM ('NEWS', 'EVENT', 'PROMO', 'ALERT');

-- CreateEnum
CREATE TYPE "AnnouncementAudience" AS ENUM ('ALL', 'MEMBERS');

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "subscriptionId" TEXT;

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "centerId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "imageUrl" TEXT,
    "category" "AnnouncementCategory" NOT NULL DEFAULT 'NEWS',
    "audience" "AnnouncementAudience" NOT NULL DEFAULT 'ALL',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnouncementView" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnnouncementView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnlineWorkout" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "durationMin" INTEGER NOT NULL,
    "thumbnailUrl" TEXT,
    "videoUrl" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OnlineWorkout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Booking_subscriptionId_idx" ON "Booking"("subscriptionId");

-- CreateIndex
CREATE INDEX "Announcement_orgId_idx" ON "Announcement"("orgId");

-- CreateIndex
CREATE INDEX "Announcement_centerId_idx" ON "Announcement"("centerId");

-- CreateIndex
CREATE INDEX "AnnouncementView_announcementId_idx" ON "AnnouncementView"("announcementId");

-- CreateIndex
CREATE INDEX "AnnouncementView_memberId_idx" ON "AnnouncementView"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "AnnouncementView_announcementId_memberId_key" ON "AnnouncementView"("announcementId", "memberId");

-- CreateIndex
CREATE INDEX "OnlineWorkout_orgId_idx" ON "OnlineWorkout"("orgId");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementView" ADD CONSTRAINT "AnnouncementView_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementView" ADD CONSTRAINT "AnnouncementView_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnlineWorkout" ADD CONSTRAINT "OnlineWorkout_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
