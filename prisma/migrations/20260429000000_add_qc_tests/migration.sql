CREATE TABLE "QCTest" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QCTest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QCTestResult" (
    "id" TEXT NOT NULL,
    "qcTestId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "observed" DOUBLE PRECISION NOT NULL,
    "min" DOUBLE PRECISION,
    "max" DOUBLE PRECISION,
    "status" TEXT NOT NULL,

    CONSTRAINT "QCTestResult_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "QCTest_batchId_idx" ON "QCTest"("batchId");
CREATE INDEX "QCTest_customerId_idx" ON "QCTest"("customerId");
CREATE INDEX "QCTest_itemId_idx" ON "QCTest"("itemId");
CREATE INDEX "QCTestResult_qcTestId_idx" ON "QCTestResult"("qcTestId");
CREATE INDEX "QCTestResult_ruleId_idx" ON "QCTestResult"("ruleId");

ALTER TABLE "QCTest"
ADD CONSTRAINT "QCTest_batchId_fkey"
FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "QCTest"
ADD CONSTRAINT "QCTest_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "BatchCustomer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "QCTest"
ADD CONSTRAINT "QCTest_itemId_fkey"
FOREIGN KEY ("itemId") REFERENCES "BatchItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "QCTestResult"
ADD CONSTRAINT "QCTestResult_qcTestId_fkey"
FOREIGN KEY ("qcTestId") REFERENCES "QCTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "QCTestResult"
ADD CONSTRAINT "QCTestResult_ruleId_fkey"
FOREIGN KEY ("ruleId") REFERENCES "TestParameter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
