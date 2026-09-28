import { NextRequest } from "next/server";
import { apiError, apiOk } from "@/lib/http";
import { isSession, requireApiSession } from "@/lib/auth/require-session";
import { classifyImportUpload, findCompletedImportByHash, hashImportContents } from "@/lib/sales-import/execute";
import { guessColumnMapping, parseSpreadsheetBuffer, savedMappingFitsHeaders } from "@/lib/sales-import/parse";
import { loadTenantCatalog, readUpload } from "@/lib/sales-import/http";
import { dateParseExample, detectDateFormat, sampleDateValues } from "@/lib/sales-import/dates";

export async function POST(request: NextRequest) {
  const session = await requireApiSession(request);
  if (!isSession(session)) return session;

  const upload = await readUpload(request);
  if ("error" in upload) return upload.error;

  try {
    const contentHash = hashImportContents(upload.buffer);
    const prior = await findCompletedImportByHash(session.tenantId, contentHash);
    if (prior) {
      return apiOk({
        alreadyImportedFile: {
          fileName: prior.fileName,
          createdAt: prior.createdAt.toISOString(),
        },
      });
    }

    const table = await parseSpreadsheetBuffer(upload.buffer, upload.fileName);
    if (table.headers.length === 0) {
      return apiError("EMPTY_FILE", "No columns found in that file", 400);
    }
    const catalog = await loadTenantCatalog(session.tenantId);

    if (savedMappingFitsHeaders(catalog.savedMapping, table.headers) && catalog.savedMapping) {
      const mapping = catalog.savedMapping;
      const classified = await classifyImportUpload({
        tenantId: session.tenantId,
        buffer: upload.buffer,
        fileName: upload.fileName,
        mapping,
        resolutionsJson: upload.resolutionsJson,
        table,
        contentHash,
      });
      if (!classified.ok) {
        return apiError("INVALID_MAPPING", classified.error, 400);
      }
      return apiOk({
        ...classified.classified.summary,
        fileName: upload.fileName,
        headers: table.headers,
        previewRows: table.rows.slice(0, 10),
        mapping,
        usedSavedMapping: true,
        ignoredNames: classified.ignoredNames,
        mappings: classified.options,
      });
    }

    const guessed = guessColumnMapping(table.headers, catalog.savedMapping);
    const samples = guessed.date ? sampleDateValues(table.rows, guessed.date) : [];
    const detected = detectDateFormat(samples);
    const mapping = {
      ...guessed,
      dateFormat: catalog.savedMapping?.dateFormat ?? detected,
    };
    return apiOk({
      fileName: upload.fileName,
      headers: table.headers,
      previewRows: table.rows.slice(0, 10),
      rowCount: table.rows.length,
      mapping,
      usedSavedMapping: false,
      detectedDateFormat: detected,
      dateExample: mapping.date ? dateParseExample(samples, mapping.dateFormat) : null,
      ignoredNames: catalog.ignoredNames,
    });
  } catch (error) {
    return apiError(
      "PARSE_FAILED",
      error instanceof Error ? error.message : "Could not read that file",
      400,
    );
  }
}
