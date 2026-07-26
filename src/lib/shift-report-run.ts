import { prisma } from "@/lib/prisma";
import {
  getShiftWindowForReport,
  parseShiftSchedule,
  type ShiftWindow,
} from "@/lib/shift-schedule";

export type ShiftReportTenantState = {
  shiftSchedule: unknown;
  shiftReportScheduledAt: Date | null;
  shiftReportReadyAt: Date | null;
  shiftReportWindowStartAt: Date | null;
  shiftReportWindowEndAt: Date | null;
};

export function resolveReportWindow(
  tenant: ShiftReportTenantState,
  now = new Date(),
): { windowStart: Date; windowEnd: Date; shiftWindow: ShiftWindow | null } | null {
  const schedule = parseShiftSchedule(tenant.shiftSchedule);

  if (tenant.shiftReportReadyAt && tenant.shiftReportWindowStartAt && tenant.shiftReportWindowEndAt) {
    return {
      windowStart: tenant.shiftReportWindowStartAt,
      windowEnd: tenant.shiftReportWindowEndAt,
      shiftWindow: getShiftWindowForReport(schedule, tenant.shiftReportWindowEndAt),
    };
  }

  if (tenant.shiftReportScheduledAt && now >= tenant.shiftReportScheduledAt) {
    const windowStart =
      tenant.shiftReportWindowStartAt ??
      getShiftWindowForReport(schedule, tenant.shiftReportScheduledAt)?.windowStart ??
      new Date(tenant.shiftReportScheduledAt.getTime() - 8 * 60 * 60 * 1000);
    const windowEnd = tenant.shiftReportScheduledAt;
    return {
      windowStart,
      windowEnd,
      shiftWindow: getShiftWindowForReport(schedule, windowEnd),
    };
  }

  const shiftWindow = getShiftWindowForReport(schedule, now);
  if (!shiftWindow) return null;
  return {
    windowStart: shiftWindow.windowStart,
    windowEnd: shiftWindow.windowEnd,
    shiftWindow,
  };
}

export async function finalizeShiftReportIfDue(tenantId: string, now = new Date()): Promise<boolean> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      shiftSchedule: true,
      shiftReportScheduledAt: true,
      shiftReportReadyAt: true,
      shiftReportWindowStartAt: true,
      shiftReportWindowEndAt: true,
    },
  });
  if (!tenant) return false;

  if (
    tenant.shiftReportScheduledAt &&
    !tenant.shiftReportReadyAt &&
    now >= tenant.shiftReportScheduledAt
  ) {
    const windowStart =
      tenant.shiftReportWindowStartAt ??
      getShiftWindowForReport(parseShiftSchedule(tenant.shiftSchedule), tenant.shiftReportScheduledAt)
        ?.windowStart ??
      new Date(tenant.shiftReportScheduledAt.getTime() - 8 * 60 * 60 * 1000);

    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        shiftReportReadyAt: now,
        shiftReportScheduledAt: null,
        shiftReportWindowStartAt: windowStart,
        shiftReportWindowEndAt: tenant.shiftReportScheduledAt,
      },
    });
    return true;
  }
  return false;
}

export function isReportStale(
  tenant: ShiftReportTenantState,
  now = new Date(),
): boolean {
  if (!tenant.shiftReportReadyAt || !tenant.shiftReportWindowEndAt) return false;
  const schedule = parseShiftSchedule(tenant.shiftSchedule);
  const current = getShiftWindowForReport(schedule, now);
  if (!current) return false;
  return tenant.shiftReportWindowEndAt.getTime() < current.windowStart.getTime();
}
