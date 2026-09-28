ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "salesImportColumnMapping" JSONB;

CREATE TABLE IF NOT EXISTS "SalesImportBatch" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "rowsImported" INTEGER NOT NULL,
  "rowsSkippedDuplicate" INTEGER NOT NULL DEFAULT 0,
  "dateRangeStart" TIMESTAMP(3),
  "dateRangeEnd" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SalesImportBatch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SalesImportBatch_tenantId_createdAt_idx"
  ON "SalesImportBatch"("tenantId", "createdAt");

ALTER TABLE "SalesImportBatch" DROP CONSTRAINT IF EXISTS "SalesImportBatch_tenantId_fkey";
ALTER TABLE "SalesImportBatch"
  ADD CONSTRAINT "SalesImportBatch_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PosSale" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'POS';
ALTER TABLE "PosSale" ADD COLUMN IF NOT EXISTS "importBatchId" TEXT;
ALTER TABLE "PosSale" ADD COLUMN IF NOT EXISTS "billNumber" TEXT;

CREATE INDEX IF NOT EXISTS "PosSale_importBatchId_idx" ON "PosSale"("importBatchId");
CREATE INDEX IF NOT EXISTS "PosSale_tenantId_source_idx" ON "PosSale"("tenantId", "source");

ALTER TABLE "PosSale" DROP CONSTRAINT IF EXISTS "PosSale_importBatchId_fkey";
ALTER TABLE "PosSale"
  ADD CONSTRAINT "PosSale_importBatchId_fkey"
  FOREIGN KEY ("importBatchId") REFERENCES "SalesImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
