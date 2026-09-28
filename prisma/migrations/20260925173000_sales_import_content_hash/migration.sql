ALTER TABLE "SalesImportBatch" ADD COLUMN IF NOT EXISTS "contentHash" TEXT;

CREATE INDEX IF NOT EXISTS "SalesImportBatch_tenantId_contentHash_idx"
  ON "SalesImportBatch"("tenantId", "contentHash");
