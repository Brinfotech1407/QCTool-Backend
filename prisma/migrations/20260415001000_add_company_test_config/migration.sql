-- CreateTable
CREATE TABLE "CompanyTestConfig" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "standardId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyTestConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompanyTestConfig_companyId_categoryId_testId_key" ON "CompanyTestConfig"("companyId", "categoryId", "testId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyTestConfig_companyId_categoryId_sequence_key" ON "CompanyTestConfig"("companyId", "categoryId", "sequence");

-- CreateIndex
CREATE INDEX "CompanyTestConfig_companyId_standardId_idx" ON "CompanyTestConfig"("companyId", "standardId");

-- CreateIndex
CREATE INDEX "CompanyTestConfig_companyId_categoryId_idx" ON "CompanyTestConfig"("companyId", "categoryId");

-- AddForeignKey
ALTER TABLE "CompanyTestConfig" ADD CONSTRAINT "CompanyTestConfig_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyTestConfig" ADD CONSTRAINT "CompanyTestConfig_standardId_fkey" FOREIGN KEY ("standardId") REFERENCES "Standard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyTestConfig" ADD CONSTRAINT "CompanyTestConfig_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "TestCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyTestConfig" ADD CONSTRAINT "CompanyTestConfig_testId_fkey" FOREIGN KEY ("testId") REFERENCES "Test"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
