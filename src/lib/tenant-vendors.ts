import { prisma } from "@/lib/prisma";

export async function filterTenantVendorIds(
  tenantId: string,
  ids: string[],
): Promise<string[]> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const found = await prisma.vendor.findMany({
    where: { tenantId, id: { in: unique } },
    select: { id: true },
  });
  const allowed = new Set(found.map((v) => v.id));
  return unique.filter((id) => allowed.has(id));
}
