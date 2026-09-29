ALTER TABLE "StockOrder" ADD COLUMN IF NOT EXISTS "approvalBatchId" TEXT;

CREATE INDEX IF NOT EXISTS "StockOrder_tenantId_approvalBatchId_idx"
  ON "StockOrder"("tenantId", "approvalBatchId");

CREATE TABLE IF NOT EXISTS "WhatsAppMessageLog" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT,
  "templateName" TEXT,
  "recipient" TEXT NOT NULL,
  "metaMessageId" TEXT,
  "direction" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsAppMessageLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppMessageLog_metaMessageId_key"
  ON "WhatsAppMessageLog"("metaMessageId");

CREATE INDEX IF NOT EXISTS "WhatsAppMessageLog_tenantId_createdAt_idx"
  ON "WhatsAppMessageLog"("tenantId", "createdAt");

ALTER TABLE "WhatsAppMessageLog" DROP CONSTRAINT IF EXISTS "WhatsAppMessageLog_tenantId_fkey";
ALTER TABLE "WhatsAppMessageLog"
  ADD CONSTRAINT "WhatsAppMessageLog_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
