import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, apiOk } from "@/lib/http";
import { isSession, requireApiSession } from "@/lib/auth/require-session";
import {
  formatShiftTime,
  getDayShift,
  getTodayShiftEndDate,
  parseShiftSchedule,
  todayDayKey,
} from "@/lib/shift-schedule";
import { finalizeShiftReportIfDue } from "@/lib/shift-report-run";

export async function GET(request: NextRequest) {
  const session = await requireApiSession(request);
  if (!isSession(session)) return session;

  try {
    await finalizeShiftReportIfDue(session.tenantId);

    const tenant = await prisma.tenant.findUnique({
      where: { id: session.tenantId },
      select: {
        shiftSchedule: true,
        shiftReportScheduledAt: true,
        shiftReportReadyAt: true,
        shiftReportWindowStartAt: true,
        shiftReportWindowEndAt: true,
      },
    });
    if (!tenant) {
      return apiError("TENANT_NOT_FOUND", "Venue not found", 404);
    }

    const schedule = parseShiftSchedule(tenant.shiftSchedule);
    const now = new Date();
    const todayKey = todayDayKey(now);
    const todayDay = getDayShift(schedule, todayKey);
    const todayEnd = getTodayShiftEndDate(schedule, now);
    const scheduledEndLabel = todayDay?.end ? formatShiftTime(todayDay.end) : null;

    let phase: "none" | "scheduled" | "ready" = "none";
    let banner: string | null = null;
    let downloadEnabled = false;

    if (tenant.shiftReportReadyAt) {
      phase = "ready";
      banner = `Shift report is generated and ready to download - ${tenant.shiftReportReadyAt.toLocaleString()}`;
      downloadEnabled = true;
    } else if (tenant.shiftReportScheduledAt && now < tenant.shiftReportScheduledAt) {
      phase = "scheduled";
      banner = `Shift report is scheduled to be generated at ${scheduledEndLabel ?? tenant.shiftReportScheduledAt.toLocaleTimeString()}`;
      downloadEnabled = false;
    }

    return apiOk({
      phase,
      banner,
      downloadEnabled,
      scheduledAt: tenant.shiftReportScheduledAt?.toISOString() ?? null,
      scheduledEndAt: tenant.shiftReportScheduledAt?.toISOString() ?? null,
      scheduledEndLabel,
      readyAt: tenant.shiftReportReadyAt?.toISOString() ?? null,
      windowStartAt: tenant.shiftReportWindowStartAt?.toISOString() ?? null,
      windowEndAt: tenant.shiftReportWindowEndAt?.toISOString() ?? null,
      todayShiftEnd: todayEnd?.toISOString() ?? null,
      todayShiftEndLabel: scheduledEndLabel,
    });
  } catch (error) {
    return apiError("SHIFT_REPORT_STATUS_FAILED", "Failed to fetch shift report status", 500, {
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
