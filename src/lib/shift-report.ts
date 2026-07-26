import { BottleRotationStatus } from "@prisma/client";
import { formatMlForBottleSize } from "@/lib/bottle-broken-display";
import { formatBottleSizeLabel } from "@/lib/product-naming";
import { getCurrentStockMl } from "@/lib/inventory";
import { mlRemainingForRotation, sumSaleMlForRotationsInWindow } from "@/lib/slippage";
import { prisma } from "@/lib/prisma";
import {
  formatDayLabel,
  formatShiftDateLabel,
  formatShiftTime,
  type DayKey,
} from "@/lib/shift-schedule";

function buildPhysicalState(args: {
  fullInStorage: number;
  inRotation: boolean;
  rotationMl: number;
  bottleSizeMl: number;
}): string {
  const parts: string[] = [];
  parts.push(
    `${args.fullInStorage} full bottle${args.fullInStorage === 1 ? "" : "s"} in storage`,
  );
  if (args.inRotation) {
    parts.push(
      `1 open bottle with ${formatMlForBottleSize(args.rotationMl, args.bottleSizeMl)} remaining`,
    );
  }
  return parts.join(" + ");
}

function formatPosOrdersThisShift(
  soldMl: number,
  hadRotation: boolean,
  bottleSizeMl: number,
): string {
  if (!hadRotation) return "—";
  if (soldMl <= 0) return "0ml";
  return formatMlForBottleSize(soldMl, bottleSizeMl);
}

export type ShiftReportRow = {
  skuName: string;
  bottleSize: string;
  bottlesInStorage: number;
  bottleInRotation: string;
  expectedRemainingInRotation: string;
  posOrdersThisShift: string;
  expectedPhysicalState: string;
};

export type ShiftReportMetadata = {
  venueName: string;
  dayKey: DayKey;
  windowStart: Date;
  windowEnd: Date;
};

export async function buildShiftReportRows(
  tenantId: string,
  windowStart: Date,
  windowEnd: Date,
): Promise<ShiftReportRow[]> {
  const products = await prisma.product.findMany({
    where: { tenantId },
    orderBy: { name: "asc" },
    include: {
      bottleRotations: {
        where: { status: BottleRotationStatus.ACTIVE },
        take: 1,
      },
    },
  });

  const rows: ShiftReportRow[] = [];

  for (const product of products) {
    const bottleSizeMl = Number(product.bottleSizeMl);
    const currentMl = await getCurrentStockMl(product.id);
    const fullInStorage = Math.floor(currentMl / bottleSizeMl);
    const activeRotation = product.bottleRotations[0] ?? null;
    const inRotation = Boolean(activeRotation);

    let rotationMl = 0;
    if (activeRotation) {
      rotationMl = await mlRemainingForRotation({
        productId: product.id,
        bottleSizeMl,
        openedAt: activeRotation.openedAt,
      });
    }

    const { soldMl, hadRotation } = await sumSaleMlForRotationsInWindow(
      product.id,
      tenantId,
      windowStart,
      windowEnd,
    );

    rows.push({
      skuName: product.name,
      bottleSize: formatBottleSizeLabel(bottleSizeMl),
      bottlesInStorage: fullInStorage,
      bottleInRotation: inRotation ? "Yes" : "No",
      expectedRemainingInRotation: inRotation
        ? formatMlForBottleSize(rotationMl, bottleSizeMl)
        : "—",
      posOrdersThisShift: formatPosOrdersThisShift(soldMl, hadRotation, bottleSizeMl),
      expectedPhysicalState: buildPhysicalState({
        fullInStorage,
        inRotation,
        rotationMl,
        bottleSizeMl,
      }),
    });
  }

  return rows;
}

function escapeCsvCell(value: string | number): string {
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function generateShiftReportCsvBuffer(
  rows: ShiftReportRow[],
  metadata?: ShiftReportMetadata,
): Buffer {
  const headers = [
    "SKU Name",
    "Bottle Size",
    "Bottles in Storage",
    "Bottle in Rotation",
    "Expected Remaining in Rotation",
    "POS Orders This Shift",
    "Expected Physical State",
  ];

  const metaLines: string[] = [];
  if (metadata) {
    const shiftDate = formatShiftDateLabel(metadata.windowStart, metadata.dayKey);
    const startLabel = formatShiftTime(
      `${metadata.windowStart.getHours().toString().padStart(2, "0")}:${metadata.windowStart.getMinutes().toString().padStart(2, "0")}`,
    );
    const endLabel = formatShiftTime(
      `${metadata.windowEnd.getHours().toString().padStart(2, "0")}:${metadata.windowEnd.getMinutes().toString().padStart(2, "0")}`,
    );
    metaLines.push(
      ["Shift Date", shiftDate].map(escapeCsvCell).join(","),
      ["Shift Start", startLabel].map(escapeCsvCell).join(","),
      ["Shift End", endLabel].map(escapeCsvCell).join(","),
      [
        "Shift Window (ISO)",
        `${metadata.windowStart.toISOString()} / ${metadata.windowEnd.toISOString()}`,
      ]
        .map(escapeCsvCell)
        .join(","),
      ["Venue", metadata.venueName].map(escapeCsvCell).join(","),
      "",
    );
  }

  const lines = [
    ...metaLines,
    headers.map(escapeCsvCell).join(","),
    ...rows.map((r) =>
      [
        r.skuName,
        r.bottleSize,
        r.bottlesInStorage,
        r.bottleInRotation,
        r.expectedRemainingInRotation,
        r.posOrdersThisShift,
        r.expectedPhysicalState,
      ]
        .map(escapeCsvCell)
        .join(","),
    ),
  ];
  return Buffer.from(`\uFEFF${lines.join("\n")}`, "utf-8");
}
