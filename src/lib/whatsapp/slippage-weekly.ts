import { BottleRotationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { addIsoDays, istIsoDate } from "@/lib/forecast/dates";
import { isWhatsAppConfigured, sendTemplate } from "@/lib/whatsapp/client";
import { indianNumber, sanitizeTemplateVar } from "@/lib/whatsapp/sanitize";

export async function weeklySlippageSummary(tenantId: string): Promise<{
  totalMl: number;
  bottleCount: number;
  pegs: number;
  biggest: string;
} | null> {
  const endIso = istIsoDate();
  const startIso = addIsoDays(endIso, -7);
  const start = new Date(`${startIso}T00:00:00.000+05:30`);
  const rotations = await prisma.bottleRotation.findMany({
    where: {
      tenantId,
      status: BottleRotationStatus.CLOSED,
      closedAt: { gte: start },
      slippageMl: { not: null },
    },
    include: { product: { select: { name: true } } },
  });

  const leaks = rotations
    .map((r) => ({ name: r.product.name, ml: Math.max(0, r.slippageMl ?? 0) }))
    .filter((r) => r.ml > 0);
  if (leaks.length === 0) return null;

  const totalMl = leaks.reduce((sum, r) => sum + r.ml, 0);
  const bySku = new Map<string, number>();
  for (const leak of leaks) {
    bySku.set(leak.name, (bySku.get(leak.name) ?? 0) + leak.ml);
  }
  let biggestName = "";
  let biggestMl = 0;
  for (const [name, ml] of bySku) {
    if (ml > biggestMl) {
      biggestName = name;
      biggestMl = ml;
    }
  }

  return {
    totalMl,
    bottleCount: leaks.length,
    pegs: Math.round(totalMl / 30),
    biggest: `${biggestName}, ${indianNumber(biggestMl)} ml`,
  };
}

export async function sendWeeklySlippageForTenant(tenantId: string): Promise<{ sent: boolean }> {
  if (!isWhatsAppConfigured()) return { sent: false };
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true, adminWhatsappNumber: true },
  });
  if (!tenant?.adminWhatsappNumber) return { sent: false };
  const summary = await weeklySlippageSummary(tenantId);
  if (!summary) return { sent: false };

  await sendTemplate(
    tenant.adminWhatsappNumber,
    "weekly_slippage",
    [
      tenant.name,
      indianNumber(summary.totalMl),
      String(summary.bottleCount),
      String(summary.pegs),
      sanitizeTemplateVar(summary.biggest),
    ],
    [],
    tenantId,
  );
  return { sent: true };
}

export async function sendWeeklySlippageReports(): Promise<{ tenants: number; sent: number }> {
  const tenants = await prisma.tenant.findMany({
    where: { adminWhatsappNumber: { not: null } },
    select: { id: true },
  });
  let sent = 0;
  for (const t of tenants) {
    if ((await sendWeeklySlippageForTenant(t.id)).sent) sent += 1;
  }
  return { tenants: tenants.length, sent };
}
