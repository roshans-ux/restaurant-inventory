import { NextRequest } from "next/server";
import { apiError, apiOk } from "@/lib/http";
import { isSession, requireApiSession } from "@/lib/auth/require-session";
import { classifyImportUpload, hashImportContents } from "@/lib/sales-import/execute";
import { importMatchedRows } from "@/lib/sales-import/record";
import { columnMappingSchema, readUpload } from "@/lib/sales-import/http";
import { istIsoDate } from "@/lib/forecast/dates";

export async function POST(request: NextRequest) {
  const session = await requireApiSession(request);
  if (!isSession(session)) return session;

  const upload = await readUpload(request);
  if ("error" in upload) return upload.error;
  if (!upload.mappingJson) {
    return apiError("MISSING_MAPPING", "Column mapping is required", 400);
  }

  let mapping;
  try {
    mapping = columnMappingSchema.parse(JSON.parse(upload.mappingJson));
  } catch {
    return apiError("INVALID_MAPPING", "Column mapping is invalid", 400);
  }

  try {
    const contentHash = hashImportContents(upload.buffer);
    const classified = await classifyImportUpload({
      tenantId: session.tenantId,
      buffer: upload.buffer,
      fileName: upload.fileName,
      mapping,
      resolutionsJson: upload.resolutionsJson,
      contentHash,
    });
    if (!classified.ok) {
      return apiError("INVALID_MAPPING", classified.error, 400);
    }

    const imported = await importMatchedRows({
      tenantId: session.tenantId,
      fileName: upload.fileName,
      contentHash,
      matched: classified.classified.matched,
    });

    return apiOk({
      ...imported,
      dateRangeStart: imported.dateRangeStart ? istIsoDate(imported.dateRangeStart) : null,
      dateRangeEnd: imported.dateRangeEnd ? istIsoDate(imported.dateRangeEnd) : null,
      invalidQuantity: classified.classified.summary.invalidQuantity,
      unparseableDates: classified.classified.summary.unparseableDates.length,
      unmatchedSkipped:
        classified.classified.summary.unmatched.reduce((n, g) => n + g.count, 0) +
        classified.classified.summary.needsPourSize.reduce((n, g) => n + g.count, 0),
    });
  } catch (error) {
    return apiError(
      "IMPORT_FAILED",
      error instanceof Error ? error.message : "Import failed",
      500,
    );
  }
}
