import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError, apiOk } from "@/lib/http";
import { isSession, requireApiSession } from "@/lib/auth/require-session";
import { parseShiftSchedule } from "@/lib/shift-schedule";

export async function GET(request: NextRequest) {
  const session = await requireApiSession(request);
  if (!isSession(session)) return session;

  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: session.tenantId },
      select: {
        id: true,
        name: true,
        slug: true,
        slippageTolerancePercent: true,
        shiftSchedule: true,
        shiftReportScheduledAt: true,
        shiftReportReadyAt: true,
        shiftReportWindowStartAt: true,
        apiKey: true,
        posWebhookSecret: true,
      },
    });
    if (!tenant) {
      return apiError("TENANT_NOT_FOUND", "Venue not found", 404);
    }
    return apiOk({
      ...tenant,
      shiftSchedule: parseShiftSchedule(tenant.shiftSchedule),
    });
  } catch (error) {
    return apiError("SETTINGS_FETCH_FAILED", "Failed to fetch settings", 500, {
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

const patchSchema = z.object({
  slippageTolerancePercent: z.number().int().min(1).max(100).optional(),
  shiftSchedule: z
    .record(z.string(), z.union([z.string().regex(/^\d{2}:\d{2}$/), z.null()]))
    .optional(),
});

export async function PATCH(request: NextRequest) {
  const session = await requireApiSession(request);
  if (!isSession(session)) return session;

  try {
    const payload = patchSchema.parse(await request.json());
    const updated = await prisma.tenant.update({
      where: { id: session.tenantId },
      data: {
        ...(payload.slippageTolerancePercent !== undefined
          ? { slippageTolerancePercent: payload.slippageTolerancePercent }
          : {}),
        ...(payload.shiftSchedule !== undefined
          ? { shiftSchedule: payload.shiftSchedule }
          : {}),
      },
      select: {
        slippageTolerancePercent: true,
        shiftSchedule: true,
      },
    });
    return apiOk({
      ...updated,
      shiftSchedule: parseShiftSchedule(updated.shiftSchedule),
    });
  } catch (error) {
    return apiError("SETTINGS_UPDATE_FAILED", "Failed to update settings", 400, {
      message: error instanceof Error ? error.message : "Invalid request",
    });
  }
}
