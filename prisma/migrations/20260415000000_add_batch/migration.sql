-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('CREATED', 'QC_PENDING', 'QC_IN_PROGRESS', 'QC_COMPLETED', 'TC_GENERATED');

-- CreateTable
CREATE TABLE "Batch" (
    "id" TEXT NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "outwardPartyCode" TEXT NOT NULL,
    "requiredSize" TEXT NOT NULL,
    "requiredQuantity" DOUBLE PRECISION NOT NULL,
    "hitId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "status" "BatchStatus" NOT NULL DEFAULT 'CREATED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Batch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Batch_batchNumber_key" ON "Batch"("batchNumber");

-- CreateIndex
CREATE INDEX "Batch_companyId_createdAt_idx" ON "Batch"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "Batch_companyId_status_idx" ON "Batch"("companyId", "status");

-- CreateIndex
CREATE INDEX "Batch_companyId_hitId_idx" ON "Batch"("companyId", "hitId");

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_hitId_fkey" FOREIGN KEY ("hitId") REFERENCES "HitEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
