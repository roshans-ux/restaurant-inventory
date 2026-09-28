import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/http";
import type { ImportDateFormat, SalesImportColumnMapping } from "@/lib/sales-import/types";
import { RESOLUTION_CHANGE, RESOLUTION_IGNORE, RESOLUTION_SKIP } from "@/lib/sales-import/types";

export const MAX_IMPORT_BYTES = 8 * 1024 * 1024;

export const columnMappingSchema = z.object({
  date: z.string().min(1),
  time: z.string().nullable(),
  posItemId: z.string().nullable(),
  itemName: z.string().nullable(),
  quantity: z.string().min(1),
  billNumber: z.string().nullable(),
  dateFormat: z.enum(["dmy", "mdy", "ymd"]).default("dmy"),
});

export function parseResolutions(raw: string | null): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "string" && v.trim()) out[k.trim().toLowerCase()] = v.trim();
    }
    return out;
  } catch {
    return {};
  }
}

export function parseIgnoredNames(value: unknown): string[] {
  return parseImportPrefs(value).ignored;
}

export function parsePourAliases(value: unknown): Record<string, string> {
  return parseImportPrefs(value).pours;
}

export function parseImportPrefs(value: unknown): { ignored: string[]; pours: Record<string, string> } {
  if (Array.isArray(value)) {
    return { ignored: normalizeNameList(value), pours: {} };
  }
  if (value && typeof value === "object") {
    const obj = value as { ignored?: unknown; pours?: unknown };
    const pours: Record<string, string> = {};
    if (obj.pours && typeof obj.pours === "object" && !Array.isArray(obj.pours)) {
      for (const [k, v] of Object.entries(obj.pours as Record<string, unknown>)) {
        if (typeof v === "string" && v.trim() && v !== RESOLUTION_SKIP && v !== RESOLUTION_IGNORE && v !== RESOLUTION_CHANGE) {
          pours[k.trim().toLowerCase()] = v.trim();
        }
      }
    }
    return { ignored: normalizeNameList(obj.ignored), pours };
  }
  return { ignored: [], pours: {} };
}

function normalizeNameList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((v): v is string => typeof v === "string").map((v) => v.trim().toLowerCase()).filter(Boolean))];
}

export async function readUpload(request: NextRequest): Promise<
  | { error: Response }
  | {
      buffer: Buffer;
      fileName: string;
      mappingJson: string | null;
      resolutionsJson: string | null;
    }
> {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return { error: apiError("MISSING_FILE", "Choose a CSV or Excel file", 400) };
  }
  if (file.size > MAX_IMPORT_BYTES) {
    return { error: apiError("FILE_TOO_LARGE", "File must be 8 MB or smaller", 400) };
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const mappingJson = typeof form.get("mapping") === "string" ? String(form.get("mapping")) : null;
  const resolutionsJson =
    typeof form.get("resolutions") === "string"
      ? String(form.get("resolutions"))
      : typeof form.get("aliases") === "string"
        ? String(form.get("aliases"))
        : null;
  return { buffer, fileName: file.name || "upload.csv", mappingJson, resolutionsJson };
}

export async function loadTenantCatalog(tenantId: string) {
  const [pours, cocktails, tenant] = await Promise.all([
    prisma.posMenuMapping.findMany({
      where: { tenantId },
      select: {
        posItemId: true,
        productId: true,
        pourMl: true,
        product: { select: { name: true, defaultPourMl: true } },
      },
    }),
    prisma.cocktailMapping.findMany({
      where: { tenantId },
      select: { posItemId: true, name: true, ingredients: true },
    }),
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { salesImportColumnMapping: true, salesImportIgnoredNames: true },
    }),
  ]);
  const saved = tenant?.salesImportColumnMapping as SalesImportColumnMapping | null;
  const prefs = parseImportPrefs(tenant?.salesImportIgnoredNames);
  return {
    pours,
    cocktails,
    savedMapping: saved,
    ignoredNames: prefs.ignored,
    pourAliases: prefs.pours,
  };
}

export async function persistImportPrefs(
  tenantId: string,
  prefs: { ignored: string[]; pours: Record<string, string> },
) {
  await prisma.tenant.updateMany({
    where: { id: tenantId },
    data: {
      salesImportIgnoredNames: {
        ignored: prefs.ignored,
        pours: prefs.pours,
      },
    },
  });
}

export async function persistIgnoredNames(tenantId: string, names: string[]) {
  const catalog = await loadTenantCatalog(tenantId);
  await persistImportPrefs(tenantId, { ignored: names, pours: catalog.pourAliases });
}

export async function persistMappingAndPrefs(
  tenantId: string,
  mapping: SalesImportColumnMapping,
  prefs: { ignored: string[]; pours: Record<string, string> },
) {
  await prisma.tenant.updateMany({
    where: { id: tenantId },
    data: {
      salesImportColumnMapping: mapping,
      salesImportIgnoredNames: {
        ignored: prefs.ignored,
        pours: prefs.pours,
      },
    },
  });
}

export function mergeIgnored(existing: string[], extra: string[]): string[] {
  return [...new Set([...existing, ...extra.map((n) => n.trim().toLowerCase())].filter(Boolean))];
}

export function mergePourAliases(
  existing: Record<string, string>,
  extra: Record<string, string>,
  removeKeys: string[] = [],
): Record<string, string> {
  const next = { ...existing, ...extra };
  for (const key of removeKeys) delete next[key];
  return next;
}

export type { ImportDateFormat };
