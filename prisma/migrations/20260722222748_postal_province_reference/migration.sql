-- CreateTable
CREATE TABLE "PostalProvince" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "PostalProvince_pkey" PRIMARY KEY ("code")
);
