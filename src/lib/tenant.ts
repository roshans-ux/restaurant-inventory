import { prisma } from "@/lib/prisma";

export async function findProductForTenant(tenantId: string, productId: string) {
  return prisma.product.findFirst({
    where: { id: productId, tenantId },
  });
}

export async function findReorderConfigForTenant(tenantId: string, productId: string) {
  return prisma.reorderConfig.findFirst({
    where: { productId, product: { tenantId } },
  });
}

export async function findAlertForTenant(tenantId: string, alertId: string) {
  return prisma.alert.findFirst({
    where: { id: alertId, product: { tenantId } },
    include: { product: true },
  });
}
