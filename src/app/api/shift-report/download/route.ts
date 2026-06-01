import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/http";
import { isSession, requireApiSession } from "@/lib/auth/require-session";
import { parseShiftSchedule, getPreviousShiftEnd } from "@/lib/shift-schedule";
import { buildShiftReportRows, generateShiftReportCsvBuffer } from "@/lib/shift-report";
import { shiftReportFilename } from "@/lib/shift-report-filename";

export async function GET(request: NextRequest) {
  const session = await requireApiSession(request);
  if (!isSession(session)) return session;

  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: session.tenantId },
      select: {
        shiftSchedule: true,
        shiftReportReadyAt: true,
        shiftReportScheduledAt: true,
        shiftReportWindowStartAt: true,
      },
    });
    if (!tenant) {
      return apiError("TENANT_NOT_FOUND", "Venue not found", 404);
    }

    const now = new Date();
    const schedule = parseShiftSchedule(tenant.shiftSchedule);

    const windowEnd =
      tenant.shiftReportReadyAt ??
      (tenant.shiftReportScheduledAt && now >= tenant.shiftReportScheduledAt
        ? now
        : null);

    if (!windowEnd) {
      return apiError(
        "REPORT_NOT_READY",
        "No shift report available. Generate or schedule a report first.",
        404,
      );
    }

    const windowStart =
      tenant.shiftReportWindowStartAt ??
      getPreviousShiftEnd(schedule, windowEnd) ??
      new Date(windowEnd.getTime() - 8 * 60 * 60 * 1000);

    const rows = await buildShiftReportRows(session.tenantId, windowStart, windowEnd);
    const buffer = generateShiftReportCsvBuffer(rows);

    if (tenant.shiftReportScheduledAt && !tenant.shiftReportReadyAt && now >= tenant.shiftReportScheduledAt) {
      await prisma.tenant.update({
        where: { id: session.tenantId },
        data: { shiftReportReadyAt: now, shiftReportScheduledAt: null },
      });
    }

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${shiftReportFilename(windowEnd)}"`,
      },
    });
  } catch (error) {
    return apiError("SHIFT_REPORT_DOWNLOAD_FAILED", "Failed to download shift report", 500, {
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
