import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, apiOk } from "@/lib/http";
import { isSession, requireApiSession } from "@/lib/auth/require-session";
import {
  formatShiftTime,
  getTodayShiftEndDate,
  parseShiftSchedule,
  todayDayKey,
} from "@/lib/shift-schedule";

export async function GET(request: NextRequest) {
  const session = await requireApiSession(request);
  if (!isSession(session)) return session;

  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: session.tenantId },
      select: {
        shiftSchedule: true,
        shiftReportScheduledAt: true,
        shiftReportReadyAt: true,
        shiftReportWindowStartAt: true,
      },
    });
    if (!tenant) {
      return apiError("TENANT_NOT_FOUND", "Venue not found", 404);
    }

    const schedule = parseShiftSchedule(tenant.shiftSchedule);
    const now = new Date();
    let banner: string | null = null;

    if (tenant.shiftReportReadyAt) {
      banner = `Shift report ready — generated ${tenant.shiftReportReadyAt.toLocaleString()}`;
    } else if (tenant.shiftReportScheduledAt) {
      const at = tenant.shiftReportScheduledAt;
      if (now >= at) {
        banner = "Shift report is ready to download";
      } else {
        banner = `Shift report scheduled for ${at.toLocaleString()}`;
      }
    }

    const todayEnd = getTodayShiftEndDate(schedule, now);
    const todayKey = todayDayKey(now);

    return apiOk({
      scheduledAt: tenant.shiftReportScheduledAt?.toISOString() ?? null,
      readyAt: tenant.shiftReportReadyAt?.toISOString() ?? null,
      windowStartAt: tenant.shiftReportWindowStartAt?.toISOString() ?? null,
      banner,
      todayShiftEnd: todayEnd?.toISOString() ?? null,
      todayShiftEndLabel: formatShiftTime(schedule[todayKey]),
    });
  } catch (error) {
    return apiError("SHIFT_REPORT_STATUS_FAILED", "Failed to fetch shift report status", 500, {
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
