ALTER TABLE "Batch"
ADD COLUMN "grade" TEXT NOT NULL DEFAULT '',
ADD COLUMN "totalQty" DOUBLE PRECISION NOT NULL DEFAULT 0;

CREATE TABLE "BatchCustomer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,

    CONSTRAINT "BatchCustomer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BatchItem" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "od" DOUBLE PRECISION NOT NULL,
    "wt" DOUBLE PRECISION NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL,
    "condition" TEXT NOT NULL,
    "length" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "BatchItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BatchCustomer_batchId_idx" ON "BatchCustomer"("batchId");
CREATE INDEX "BatchItem_customerId_idx" ON "BatchItem"("customerId");

ALTER TABLE "BatchCustomer"
ADD CONSTRAINT "BatchCustomer_batchId_fkey"
FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BatchItem"
ADD CONSTRAINT "BatchItem_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "BatchCustomer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
