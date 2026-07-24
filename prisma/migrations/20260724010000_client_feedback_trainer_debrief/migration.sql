-- CreateTable
CREATE TABLE "ClientFeedback" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "sat" INTEGER NOT NULL,
    "prog" INTEGER NOT NULL,
    "adher" INTEGER NOT NULL,
    "motiv" INTEGER NOT NULL,
    "esf" INTEGER NOT NULL,
    "comment" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainerDebrief" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "sat" INTEGER NOT NULL,
    "prog" INTEGER NOT NULL,
    "adher" INTEGER NOT NULL,
    "motiv" INTEGER NOT NULL,
    "esf" INTEGER NOT NULL,
    "note" TEXT NOT NULL,
    "debriefAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainerDebrief_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientFeedback_memberId_idx" ON "ClientFeedback"("memberId");

-- CreateIndex
CREATE INDEX "TrainerDebrief_memberId_idx" ON "TrainerDebrief"("memberId");

-- CreateIndex
CREATE INDEX "TrainerDebrief_trainerId_idx" ON "TrainerDebrief"("trainerId");

-- AddForeignKey
ALTER TABLE "ClientFeedback" ADD CONSTRAINT "ClientFeedback_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerDebrief" ADD CONSTRAINT "TrainerDebrief_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerDebrief" ADD CONSTRAINT "TrainerDebrief_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
