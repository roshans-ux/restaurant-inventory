import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError, apiOk } from "@/lib/http";
import { isSession, requireApiSession } from "@/lib/auth/require-session";
import {
  getPreviousShiftEnd,
  getTodayShiftEndDate,
  parseShiftSchedule,
} from "@/lib/shift-schedule";
import { buildShiftReportRows, generateShiftReportCsvBuffer } from "@/lib/shift-report";
import { shiftReportFilename } from "@/lib/shift-report-filename";

const postSchema = z.object({
  mode: z.enum(["schedule", "now"]),
  confirmEarly: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  const session = await requireApiSession(request);
  if (!isSession(session)) return session;

  try {
    const payload = postSchema.parse(await request.json());
    const tenant = await prisma.tenant.findUnique({
      where: { id: session.tenantId },
      select: { shiftSchedule: true },
    });
    if (!tenant) {
      return apiError("TENANT_NOT_FOUND", "Venue not found", 404);
    }

    const schedule = parseShiftSchedule(tenant.shiftSchedule);
    const now = new Date();

    if (payload.mode === "schedule") {
      const shiftEnd = getTodayShiftEndDate(schedule, now);
      if (!shiftEnd) {
        return apiError(
          "NO_SHIFT_SCHEDULE",
          "No shift end time configured for today. Set shift schedule in Settings.",
          400,
        );
      }
      const windowStart = getPreviousShiftEnd(schedule, now) ?? new Date(now.getTime() - 8 * 60 * 60 * 1000);
      await prisma.tenant.update({
        where: { id: session.tenantId },
        data: {
          shiftReportScheduledAt: shiftEnd,
          shiftReportReadyAt: null,
          shiftReportWindowStartAt: windowStart,
        },
      });
      return apiOk({
        scheduledAt: shiftEnd.toISOString(),
        windowStart: windowStart.toISOString(),
      });
    }

    const shiftEnd = getTodayShiftEndDate(schedule, now);
    if (shiftEnd && now < shiftEnd && !payload.confirmEarly) {
      return apiError(
        "EARLY_REPORT",
        "Shift has not ended yet. Confirm to generate early.",
        409,
        { shiftEnd: shiftEnd.toISOString() },
      );
    }

    const windowStart =
      getPreviousShiftEnd(schedule, now) ?? new Date(now.getTime() - 8 * 60 * 60 * 1000);
    const rows = await buildShiftReportRows(session.tenantId, windowStart, now);
    const buffer = generateShiftReportCsvBuffer(rows);

    await prisma.tenant.update({
      where: { id: session.tenantId },
      data: {
        shiftReportReadyAt: now,
        shiftReportScheduledAt: null,
        shiftReportWindowStartAt: windowStart,
      },
    });

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${shiftReportFilename(now)}"`,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError("INVALID_REQUEST", "Invalid request", 400);
    }
    return apiError("SHIFT_REPORT_SCHEDULE_FAILED", "Failed to schedule shift report", 500, {
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
