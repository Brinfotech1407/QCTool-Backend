-- CreateEnum
CREATE TYPE "HitStatus" AS ENUM ('RECEIVED', 'QC_PENDING', 'QC_APPROVED', 'QC_REJECTED');

-- CreateTable
CREATE TABLE "HitEntry" (
    "id" TEXT NOT NULL,
    "hitNumber" TEXT NOT NULL,
    "inwardPartyName" TEXT NOT NULL,
    "inwardPartyTcNumber" TEXT NOT NULL,
    "chemicalComposition" JSONB NOT NULL,
    "size" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "availableQuantity" DOUBLE PRECISION NOT NULL,
    "inwardDate" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "status" "HitStatus" NOT NULL DEFAULT 'RECEIVED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "HitEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HitEntry_hitNumber_key" ON "HitEntry"("hitNumber");

-- CreateIndex
CREATE INDEX "HitEntry_companyId_createdAt_idx" ON "HitEntry"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "HitEntry_companyId_status_idx" ON "HitEntry"("companyId", "status");

-- CreateIndex
CREATE INDEX "HitEntry_companyId_inwardDate_idx" ON "HitEntry"("companyId", "inwardDate");

-- AddForeignKey
ALTER TABLE "HitEntry" ADD CONSTRAINT "HitEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HitEntry" ADD CONSTRAINT "HitEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
