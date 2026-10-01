import { prisma } from "@/lib/prisma";
import { toWhatsAppDigits, whatsappPhonesMatch } from "@/lib/whatsapp/phone";

export const VENUE_SESSION_MS = 12 * 60 * 60 * 1000;

export type AdminTenant = { id: string; name: string; adminWhatsappNumber: string | null };

export async function findTenantsByAdminPhone(from: string): Promise<AdminTenant[]> {
  const tenants = await prisma.tenant.findMany({
    where: { adminWhatsappNumber: { not: null } },
    select: { id: true, name: true, adminWhatsappNumber: true },
  });
  return tenants
    .filter((t) => whatsappPhonesMatch(t.adminWhatsappNumber, from))
    .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
}

export async function findTenantByApprovalBatch(batchId: string) {
  const order = await prisma.stockOrder.findFirst({
    where: { approvalBatchId: batchId },
    select: {
      tenantId: true,
      tenant: { select: { id: true, name: true, adminWhatsappNumber: true } },
    },
  });
  return order?.tenant ?? null;
}

export function parseVenueChoice(body: string, count: number): number | null {
  const trimmed = body.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < 1 || n > count) return null;
  return n;
}

export function formatVenuePicker(tenants: AdminTenant[]): string {
  const list = tenants.map((t, i) => `${i + 1}. ${t.name}`).join(", ");
  return `You manage multiple venues: ${list} Reply with the number of the venue.`;
}

export async function getVenueSession(from: string): Promise<AdminTenant | null> {
  const phone = toWhatsAppDigits(from);
  if (!phone) return null;
  const row = await prisma.whatsAppVenueSession.findUnique({
    where: { phone },
    select: {
      tenantId: true,
      expiresAt: true,
      tenant: { select: { id: true, name: true, adminWhatsappNumber: true } },
    },
  });
  if (!row || row.expiresAt.getTime() <= Date.now()) {
    if (row) {
      await prisma.whatsAppVenueSession.delete({ where: { phone } }).catch(() => undefined);
    }
    return null;
  }
  return row.tenant;
}

export async function setVenueSession(from: string, tenantId: string): Promise<void> {
  const phone = toWhatsAppDigits(from);
  if (!phone) return;
  const expiresAt = new Date(Date.now() + VENUE_SESSION_MS);
  await prisma.whatsAppVenueSession.upsert({
    where: { phone },
    create: { phone, tenantId, expiresAt },
    update: { tenantId, expiresAt },
  });
}
