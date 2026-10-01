CREATE TABLE IF NOT EXISTS "WhatsAppVenueSession" (
  "phone" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsAppVenueSession_pkey" PRIMARY KEY ("phone")
);

CREATE INDEX IF NOT EXISTS "WhatsAppVenueSession_expiresAt_idx"
  ON "WhatsAppVenueSession"("expiresAt");

ALTER TABLE "WhatsAppVenueSession" DROP CONSTRAINT IF EXISTS "WhatsAppVenueSession_tenantId_fkey";
ALTER TABLE "WhatsAppVenueSession"
  ADD CONSTRAINT "WhatsAppVenueSession_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
