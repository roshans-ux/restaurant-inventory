import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { apiOk } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { isSession, requireApiSession } from "@/lib/auth/require-session";

function sign(body: string, secret: string) {
  return createHmac("sha256", secret).update(body).digest("hex");
}

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export async function POST(request: NextRequest) {
  const session = await requireApiSession(request);
  if (!isSession(session)) return session;

  const tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId } });
  if (!tenant) {
    return Response.json({ ok: false, error: { message: "Tenant not found" } }, { status: 404 });
  }

  const baseUrl = new URL(request.url).origin;
  const secret = tenant.posWebhookSecret ?? "dev-secret";
  const cookie = request.headers.get("cookie") ?? "";
  const jsonHeaders = {
    "content-type": "application/json",
    cookie,
  };

  const createdProducts: Array<{ id: string; name: string }> = [];
  for (let i = 1; i <= 10; i++) {
    const payload = {
      name: `Scenario Bottle ${Date.now()}-${i}`,
      sku: `SCN-${randomInt(1000, 9999)}-${i}`,
      bottleSizeMl: [700, 750, 1000][randomInt(0, 2)],
      defaultPourMl: [30, 60][randomInt(0, 1)],
      openingBottles: randomInt(1, 8),
      thresholdBottles: randomInt(1, 3),
      reorderQuantity: randomInt(4, 12),
    };

    const res = await fetch(`${baseUrl}/api/products`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    const product = data?.product ?? data?.data?.product;
    if (res.ok && product?.id) {
      createdProducts.push({
        id: product.id,
        name: product.name,
      });
    }
  }

  const posItemIds: string[] = [];
  for (let i = 0; i < createdProducts.length; i++) {
    const product = createdProducts[i];
    const posItemId = `scenario_pos_${Date.now()}_${i}`;
    const res = await fetch(`${baseUrl}/api/pos-mappings`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({
        productId: product.id,
        posItemId,
        pourMl: i % 2 === 0 ? 30 : 60,
      }),
    });
    if (res.ok) posItemIds.push(posItemId);
  }

  const salesResults: Array<{ status: number; accepted: boolean }> = [];
  for (let i = 1; i <= 30; i++) {
    const posItemId = posItemIds[randomInt(0, Math.max(posItemIds.length - 1, 0))];
    const payload = {
      external_sale_id: `scenario_sale_${Date.now()}_${i}`,
      sold_at: new Date().toISOString(),
      lines: [
        {
          external_line_id: `scenario_line_${Date.now()}_${i}`,
          pos_item_id: posItemId,
          quantity: randomInt(1, 3),
        },
      ],
    };
    const raw = JSON.stringify(payload);
    const res = await fetch(`${baseUrl}/api/webhooks/pos/sale`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-pos-signature": sign(raw, secret),
        "x-tenant-api-key": tenant.apiKey,
      },
      body: raw,
    });
    salesResults.push({ status: res.status, accepted: res.ok });
  }

  const levels = await prisma.product.findMany({
    where: { tenantId: session.tenantId },
    include: { stockMovements: true },
    orderBy: { name: "asc" },
  });

  const withLevels = levels.map((p) => {
    const currentMl = p.stockMovements.reduce((sum, m) => sum + m.quantityDeltaMl, 0);
    return {
      productId: p.id,
      name: p.name,
      currentMl,
      currentBottles: Number((currentMl / Number(p.bottleSizeMl)).toFixed(2)),
    };
  });

  const lowest = [...withLevels].sort((a, b) => a.currentMl - b.currentMl)[0];
  let correctionStatus = "skipped";
  if (lowest) {
    const correctionRes = await fetch(`${baseUrl}/api/inventory/adjust`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({
        productId: lowest.productId,
        adjustmentType: "BOTTLE_BROKEN",
        remainingMl: 0,
      }),
    });
    correctionStatus = `${correctionRes.status}`;
  }

  return apiOk({
    createdProducts: createdProducts.length,
    mappedItems: posItemIds.length,
    salesAccepted: salesResults.filter((x) => x.accepted).length,
    salesRejected: salesResults.filter((x) => !x.accepted).length,
    correctionStatus,
    inventorySample: withLevels.slice(0, 5),
  });
}
