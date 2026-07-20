-- AlterEnum
-- (PG 12+: añadir un valor al enum es seguro fuera de uso en esta misma migración;
--  no se referencia 'HR_MANAGER' en ningún INSERT/DEFAULT aquí.)
ALTER TYPE "Role" ADD VALUE 'HR_MANAGER';

-- CreateTable
CREATE TABLE "CenterMembership" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "centerId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "allocationPct" INTEGER,
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CenterMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberNote" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "authorUserId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CenterMembership_orgId_idx" ON "CenterMembership"("orgId");

-- CreateIndex
CREATE INDEX "CenterMembership_centerId_idx" ON "CenterMembership"("centerId");

-- CreateIndex
CREATE INDEX "CenterMembership_userId_idx" ON "CenterMembership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CenterMembership_userId_centerId_key" ON "CenterMembership"("userId", "centerId");

-- CreateIndex
CREATE INDEX "MemberNote_orgId_idx" ON "MemberNote"("orgId");

-- CreateIndex
CREATE INDEX "MemberNote_memberId_idx" ON "MemberNote"("memberId");

-- AddForeignKey
ALTER TABLE "CenterMembership" ADD CONSTRAINT "CenterMembership_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CenterMembership" ADD CONSTRAINT "CenterMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CenterMembership" ADD CONSTRAINT "CenterMembership_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberNote" ADD CONSTRAINT "MemberNote_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberNote" ADD CONSTRAINT "MemberNote_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberNote" ADD CONSTRAINT "MemberNote_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
