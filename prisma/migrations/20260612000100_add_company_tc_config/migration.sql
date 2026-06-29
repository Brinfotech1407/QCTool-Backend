CREATE TABLE "CompanyTcConfig" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "logoUrl" TEXT,
    "isoHallmarkUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CompanyTcConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CompanyTcConfig_companyId_key" ON "CompanyTcConfig"("companyId");
ALTER TABLE "CompanyTcConfig" ADD CONSTRAINT "CompanyTcConfig_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
