-- CreateEnum
CREATE TYPE "RuleType" AS ENUM ('FIXED_RANGE', 'BAND_SINGLE', 'BAND_MATRIX', 'ASYMMETRIC_BAND', 'RATIO_PERCENT', 'FORMULA');

-- CreateTable
CREATE TABLE "RuleDefinition" (
    "id" TEXT NOT NULL,
    "parameterId" TEXT NOT NULL,
    "ruleType" "RuleType" NOT NULL,
    "ruleConfig" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RuleDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RuleDefinition_parameterId_key" ON "RuleDefinition"("parameterId");

-- AddForeignKey
ALTER TABLE "RuleDefinition" ADD CONSTRAINT "RuleDefinition_parameterId_fkey" FOREIGN KEY ("parameterId") REFERENCES "TestParameter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
