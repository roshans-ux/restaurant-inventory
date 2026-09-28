import { NextRequest } from "next/server";
import { apiError, apiOk } from "@/lib/http";
import { isSession, requireApiSession } from "@/lib/auth/require-session";
import { classifyImportUpload, hashImportContents } from "@/lib/sales-import/execute";
import { columnMappingSchema, readUpload } from "@/lib/sales-import/http";

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
    const classified = await classifyImportUpload({
      tenantId: session.tenantId,
      buffer: upload.buffer,
      fileName: upload.fileName,
      mapping,
      resolutionsJson: upload.resolutionsJson,
      contentHash: hashImportContents(upload.buffer),
    });
    if (!classified.ok) {
      return apiError("INVALID_MAPPING", classified.error, 400);
    }

    return apiOk({
      fileName: upload.fileName,
      ...classified.classified.summary,
      mapping,
      mappings: classified.options,
      ignoredNames: classified.ignoredNames,
    });
  } catch (error) {
    return apiError(
      "MATCH_FAILED",
      error instanceof Error ? error.message : "Could not match rows",
      400,
    );
  }
}
