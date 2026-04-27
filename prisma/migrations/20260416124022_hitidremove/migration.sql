/*
  Warnings:

  - You are about to drop the column `hitId` on the `Batch` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Batch" DROP CONSTRAINT "Batch_hitId_fkey";

-- DropIndex
DROP INDEX "Batch_companyId_hitId_idx";

-- AlterTable
ALTER TABLE "Batch" DROP COLUMN "hitId",
ADD COLUMN     "gradeId" TEXT NOT NULL DEFAULT 'DEFAULT',
ALTER COLUMN "outwardPartyCode" DROP NOT NULL,
ALTER COLUMN "requiredSize" DROP NOT NULL;

-- AlterTable
ALTER TABLE "HitEntry" ADD COLUMN     "availableWeight" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "condition" TEXT NOT NULL DEFAULT 'NA',
ADD COLUMN     "gradeId" TEXT NOT NULL DEFAULT 'DEFAULT',
ADD COLUMN     "length" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "od" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "thickness" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "weight" DOUBLE PRECISION NOT NULL DEFAULT 0,
ALTER COLUMN "inwardPartyName" DROP NOT NULL,
ALTER COLUMN "inwardPartyTcNumber" DROP NOT NULL,
ALTER COLUMN "size" DROP NOT NULL,
ALTER COLUMN "quantity" DROP NOT NULL,
ALTER COLUMN "availableQuantity" DROP NOT NULL,
ALTER COLUMN "inwardDate" DROP NOT NULL;

-- CreateTable
CREATE TABLE "BatchHit" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "hitId" TEXT NOT NULL,
    "usedQty" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BatchHit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BatchHit_batchId_idx" ON "BatchHit"("batchId");

-- CreateIndex
CREATE INDEX "BatchHit_hitId_idx" ON "BatchHit"("hitId");

-- AddForeignKey
ALTER TABLE "BatchHit" ADD CONSTRAINT "BatchHit_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchHit" ADD CONSTRAINT "BatchHit_hitId_fkey" FOREIGN KEY ("hitId") REFERENCES "HitEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
