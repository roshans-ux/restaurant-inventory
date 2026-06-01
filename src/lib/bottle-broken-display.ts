import { formatBottleSizeLabel } from "@/lib/product-naming";

/** ml → display label for Bottle broken adjustment stepper (reference table only). */
export const BOTTLE_BROKEN_STEP_ML = 30;

export const BOTTLE_BROKEN_BOTTLE_SIZES_ML = [750, 1000, 1750, 2000] as const;

const DISPLAY_BY_ML_750: Readonly<Record<number, string>> = {
  30: "30ml",
  60: "60ml",
  90: "90ml",
  120: "120ml",
  150: "150ml",
  180: "1 quarter",
  210: "1 quarter, 30ml",
  240: "1 quarter, 60ml",
  270: "1 quarter, 90ml",
  300: "1 quarter, 120ml",
  330: "1 quarter, 150ml",
  360: "2 quarters",
  390: "2 quarters, 30ml",
  420: "2 quarters, 60ml",
  450: "2 quarters, 90ml",
  480: "2 quarters, 120ml",
  510: "2 quarters, 150ml",
  540: "3 quarters",
  570: "3 quarters, 30ml",
  600: "3 quarters, 60ml",
  630: "3 quarters, 90ml",
  660: "3 quarters, 120ml",
  690: "3 quarters, 150ml",
  720: "4 quarters",
  750: "Full bottle (750ml)",
};

const DISPLAY_BY_ML_1000: Readonly<Record<number, string>> = {
  30: "30ml",
  60: "60ml",
  90: "90ml",
  120: "120ml",
  150: "150ml",
  180: "1 quarter",
  210: "1 quarter, 30ml",
  240: "1 quarter, 60ml",
  270: "1 quarter, 90ml",
  300: "1 quarter, 120ml",
  330: "1 quarter, 150ml",
  360: "2 quarters",
  390: "2 quarters, 30ml",
  420: "2 quarters, 60ml",
  450: "2 quarters, 90ml",
  480: "2 quarters, 120ml",
  510: "2 quarters, 150ml",
  540: "3 quarters",
  570: "3 quarters, 30ml",
  600: "3 quarters, 60ml",
  630: "3 quarters, 90ml",
  660: "3 quarters, 120ml",
  690: "3 quarters, 150ml",
  720: "4 quarters",
  750: "4 quarters, 30ml",
  780: "4 quarters, 60ml",
  810: "4 quarters, 90ml",
  840: "4 quarters, 120ml",
  870: "4 quarters, 150ml",
  900: "5 quarters",
  930: "5 quarters, 30ml",
  960: "5 quarters, 60ml",
  990: "5 quarters, 90ml",
  1000: "Full bottle (1L)",
};

const DISPLAY_BY_ML_1750: Readonly<Record<number, string>> = {
  30: "30ml",
  60: "60ml",
  90: "90ml",
  120: "120ml",
  150: "150ml",
  180: "1 quarter",
  210: "1 quarter, 30ml",
  240: "1 quarter, 60ml",
  270: "1 quarter, 90ml",
  300: "1 quarter, 120ml",
  330: "1 quarter, 150ml",
  360: "2 quarters",
  390: "2 quarters, 30ml",
  420: "2 quarters, 60ml",
  450: "2 quarters, 90ml",
  480: "2 quarters, 120ml",
  510: "2 quarters, 150ml",
  540: "3 quarters",
  570: "3 quarters, 30ml",
  600: "3 quarters, 60ml",
  630: "3 quarters, 90ml",
  660: "3 quarters, 120ml",
  690: "3 quarters, 150ml",
  720: "4 quarters",
  750: "4 quarters, 30ml",
  780: "4 quarters, 60ml",
  810: "4 quarters, 90ml",
  840: "4 quarters, 120ml",
  870: "4 quarters, 150ml",
  900: "5 quarters",
  930: "5 quarters, 30ml",
  960: "5 quarters, 60ml",
  990: "5 quarters, 90ml",
  1020: "5 quarters, 120ml",
  1050: "5 quarters, 150ml",
  1080: "6 quarters",
  1110: "6 quarters, 30ml",
  1140: "6 quarters, 60ml",
  1170: "6 quarters, 90ml",
  1200: "6 quarters, 120ml",
  1230: "6 quarters, 150ml",
  1260: "7 quarters",
  1290: "7 quarters, 30ml",
  1320: "7 quarters, 60ml",
  1350: "7 quarters, 90ml",
  1380: "7 quarters, 120ml",
  1410: "7 quarters, 150ml",
  1440: "8 quarters",
  1470: "8 quarters, 30ml",
  1500: "8 quarters, 60ml",
  1530: "8 quarters, 90ml",
  1560: "8 quarters, 120ml",
  1590: "8 quarters, 150ml",
  1620: "9 quarters",
  1650: "9 quarters, 30ml",
  1680: "9 quarters, 60ml",
  1710: "9 quarters, 90ml",
  1740: "9 quarters, 120ml",
  1750: "Full bottle (1.75L)",
};

const DISPLAY_BY_ML_2000: Readonly<Record<number, string>> = {
  30: "30ml",
  60: "60ml",
  90: "90ml",
  120: "120ml",
  150: "150ml",
  180: "1 quarter",
  210: "1 quarter, 30ml",
  240: "1 quarter, 60ml",
  270: "1 quarter, 90ml",
  300: "1 quarter, 120ml",
  330: "1 quarter, 150ml",
  360: "2 quarters",
  390: "2 quarters, 30ml",
  420: "2 quarters, 60ml",
  450: "2 quarters, 90ml",
  480: "2 quarters, 120ml",
  510: "2 quarters, 150ml",
  540: "3 quarters",
  570: "3 quarters, 30ml",
  600: "3 quarters, 60ml",
  630: "3 quarters, 90ml",
  660: "3 quarters, 120ml",
  690: "3 quarters, 150ml",
  720: "4 quarters",
  750: "4 quarters, 30ml",
  780: "4 quarters, 60ml",
  810: "4 quarters, 90ml",
  840: "4 quarters, 120ml",
  870: "4 quarters, 150ml",
  900: "5 quarters",
  930: "5 quarters, 30ml",
  960: "5 quarters, 60ml",
  990: "5 quarters, 90ml",
  1020: "5 quarters, 120ml",
  1050: "5 quarters, 150ml",
  1080: "6 quarters",
  1110: "6 quarters, 30ml",
  1140: "6 quarters, 60ml",
  1170: "6 quarters, 90ml",
  1200: "6 quarters, 120ml",
  1230: "6 quarters, 150ml",
  1260: "7 quarters",
  1290: "7 quarters, 30ml",
  1320: "7 quarters, 60ml",
  1350: "7 quarters, 90ml",
  1380: "7 quarters, 120ml",
  1410: "7 quarters, 150ml",
  1440: "8 quarters",
  1470: "8 quarters, 30ml",
  1500: "8 quarters, 60ml",
  1530: "8 quarters, 90ml",
  1560: "8 quarters, 120ml",
  1590: "8 quarters, 150ml",
  1620: "9 quarters",
  1650: "9 quarters, 30ml",
  1680: "9 quarters, 60ml",
  1710: "9 quarters, 90ml",
  1740: "9 quarters, 120ml",
  1770: "9 quarters, 150ml",
  1800: "10 quarters",
  1830: "10 quarters, 30ml",
  1860: "10 quarters, 60ml",
  1890: "10 quarters, 90ml",
  1920: "10 quarters, 120ml",
  1950: "10 quarters, 150ml",
  1980: "11 quarters",
  2000: "Full bottle (2L)",
};

const DISPLAY_BY_BOTTLE_SIZE: Record<number, Readonly<Record<number, string>>> = {
  750: DISPLAY_BY_ML_750,
  1000: DISPLAY_BY_ML_1000,
  1750: DISPLAY_BY_ML_1750,
  2000: DISPLAY_BY_ML_2000,
};

/** Ordered ml steps for the bottle broken stepper (keys from the reference lookup). */
export function getBottleBrokenMlSteps(bottleSizeMl: number): number[] {
  const map = DISPLAY_BY_BOTTLE_SIZE[bottleSizeMl];
  if (map) {
    return Object.keys(map)
      .map((key) => Number(key))
      .sort((a, b) => a - b);
  }
  const steps: number[] = [];
  for (let ml = BOTTLE_BROKEN_STEP_ML; ml < bottleSizeMl; ml += BOTTLE_BROKEN_STEP_ML) {
    steps.push(ml);
  }
  if (steps.length === 0 || steps[steps.length - 1] !== bottleSizeMl) {
    steps.push(bottleSizeMl);
  }
  return steps;
}

/** Display name for Bottle broken stepper; internal/saved value remains raw ml. */
export function getBottleBrokenDisplayName(ml: number, bottleSizeMl: number): string {
  const map = DISPLAY_BY_BOTTLE_SIZE[bottleSizeMl];
  if (map && map[ml] !== undefined) return map[ml];
  return `${ml}ml`;
}

function fullBottleLabel(bottleSizeMl: number): string {
  const fromTable = getBottleBrokenDisplayName(bottleSizeMl, bottleSizeMl);
  if (fromTable !== `${bottleSizeMl}ml`) return fromTable;
  return `Full bottle (${formatBottleSizeLabel(bottleSizeMl)})`;
}

/**
 * Human-readable ml for a specific bottle size using Adjustment tab terminology
 * (e.g. 1000ml on 1L → "Full bottle (1L)", 990ml → "5 quarters, 90ml").
 */
export function formatMlForBottleSize(ml: number, bottleSizeMl: number): string {
  if (ml <= 0) return "0ml";

  const fullCount = Math.floor(ml / bottleSizeMl);
  const remainderMl = ml % bottleSizeMl;
  const parts: string[] = [];

  if (fullCount > 0) {
    const label = fullBottleLabel(bottleSizeMl);
    if (fullCount === 1 && remainderMl === 0) return label;
    parts.push(`${fullCount} × ${label}`);
  }

  if (remainderMl > 0) {
    parts.push(getBottleBrokenDisplayName(remainderMl, bottleSizeMl));
  }

  return parts.join(", ");
}
