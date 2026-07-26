import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/http";
import { isSession, requireApiSession } from "@/lib/auth/require-session";
import {
  getShiftWindowForReport,
  parseShiftSchedule,
  todayDayKey,
} from "@/lib/shift-schedule";
import {
  buildShiftReportRows,
  generateShiftReportCsvBuffer,
  type ShiftReportMetadata,
} from "@/lib/shift-report";
import { shiftReportFilename } from "@/lib/shift-report-filename";
import { finalizeShiftReportIfDue, isReportStale, resolveReportWindow } from "@/lib/shift-report-run";

export async function GET(request: NextRequest) {
  const session = await requireApiSession(request);
  if (!isSession(session)) return session;

  try {
    await finalizeShiftReportIfDue(session.tenantId);

    const tenant = await prisma.tenant.findUnique({
      where: { id: session.tenantId },
      select: {
        name: true,
        shiftSchedule: true,
        shiftReportReadyAt: true,
        shiftReportScheduledAt: true,
        shiftReportWindowStartAt: true,
        shiftReportWindowEndAt: true,
      },
    });
    if (!tenant) {
      return apiError("TENANT_NOT_FOUND", "Venue not found", 404);
    }

    const now = new Date();

    if (isReportStale(tenant, now)) {
      return apiError(
        "REPORT_STALE",
        "This shift report is from a previous shift. Generate a new shift report.",
        409,
      );
    }

    const resolved = resolveReportWindow(tenant, now);
    if (!resolved) {
      return apiError(
        "REPORT_NOT_READY",
        "No shift report available. Generate or schedule a report first.",
        404,
      );
    }

    const { windowStart, windowEnd, shiftWindow } = resolved;
    const schedule = parseShiftSchedule(tenant.shiftSchedule);
    const dayKey = shiftWindow?.dayKey ?? todayDayKey(windowEnd);

    const rows = await buildShiftReportRows(session.tenantId, windowStart, windowEnd);
    const metadata: ShiftReportMetadata = {
      venueName: tenant.name,
      dayKey,
      windowStart,
      windowEnd,
    };
    const buffer = generateShiftReportCsvBuffer(rows, metadata);

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${shiftReportFilename(windowEnd)}"`,
        "X-Shift-Report-Window-End": windowEnd.toISOString(),
      },
    });
  } catch (error) {
    return apiError("SHIFT_REPORT_DOWNLOAD_FAILED", "Failed to download shift report", 500, {
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
