ALTER TABLE "Batch"
ADD COLUMN "tubeType" TEXT NOT NULL DEFAULT 'Smooth Copper Tube';

ALTER TABLE "CompanyTcConfig"
ADD COLUMN "companyAddress" TEXT;
