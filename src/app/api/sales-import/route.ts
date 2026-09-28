import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, apiOk } from "@/lib/http";
import { isSession, requireApiSession } from "@/lib/auth/require-session";
import { istIsoDate } from "@/lib/forecast/dates";
import { buildImportCatalog } from "@/lib/sales-import/catalog";
import { loadTenantCatalog } from "@/lib/sales-import/http";
import { withPgRetry } from "@/lib/pos-webhook-sale";

export async function GET(request: NextRequest) {
  const session = await requireApiSession(request);
  if (!isSession(session)) return session;

  try {
    const batches = await withPgRetry(() =>
      prisma.salesImportBatch.findMany({
        where: { tenantId: session.tenantId },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    );
    const catalog = await withPgRetry(() => loadTenantCatalog(session.tenantId));
    const built = buildImportCatalog(catalog);

    return apiOk({
      savedMapping: catalog.savedMapping,
      mappings: built.options,
      ignoredNames: catalog.ignoredNames,
      batches: batches.map((b) => ({
        id: b.id,
        fileName: b.fileName,
        createdAt: b.createdAt.toISOString(),
        rowsImported: b.rowsImported,
        rowsSkippedDuplicate: b.rowsSkippedDuplicate,
        dateRangeStart: b.dateRangeStart ? istIsoDate(b.dateRangeStart) : null,
        dateRangeEnd: b.dateRangeEnd ? istIsoDate(b.dateRangeEnd) : null,
      })),
    });
  } catch (error) {
    return apiError("IMPORT_LIST_FAILED", "Failed to load import history", 500, {
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
