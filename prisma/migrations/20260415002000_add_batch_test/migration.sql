-- CreateEnum
CREATE TYPE "TestStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'PASSED', 'FAILED');

-- CreateTable
CREATE TABLE "BatchTest" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "status" "TestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BatchTest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BatchTest_batchId_testId_key" ON "BatchTest"("batchId", "testId");

-- CreateIndex
CREATE INDEX "BatchTest_batchId_status_idx" ON "BatchTest"("batchId", "status");

-- AddForeignKey
ALTER TABLE "BatchTest" ADD CONSTRAINT "BatchTest_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchTest" ADD CONSTRAINT "BatchTest_testId_fkey" FOREIGN KEY ("testId") REFERENCES "Test"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
