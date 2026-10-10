import { NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError, apiOk } from "@/lib/http";
import { isSession, requireApiSession } from "@/lib/auth/require-session";
import { DAY_KEYS, parseShiftSchedule } from "@/lib/shift-schedule";
import { INDIAN_PHONE_ERROR, normalizeIndianPhone } from "@/lib/phone-in";
import { isWhatsAppConfigured } from "@/lib/whatsapp/client";
import { isWhatsAppEnabled } from "@/lib/whatsapp/enabled";
import { revalidateForecastCache } from "@/lib/forecast/cache";
import { monthlyPriceFromJanuaryInr } from "@/lib/billing/constants";

const timeSchema = z.union([
  z.string().regex(/^\d{2}:\d{2}$/),
  z.null(),
]);

const dayShiftSchema = z
  .object({
    start: timeSchema,
    end: timeSchema,
  })
  .nullable()
  .optional();

const patchSchema = z.object({
  slippageTolerancePercent: z.number().int().min(1).max(100).optional(),
  shiftSchedule: z
    .record(z.string(), dayShiftSchema)
    .optional(),
  adminWhatsappNumber: z.union([z.string(), z.null()]).optional(),
  paymentReminderDays: z.number().int().min(1).max(30).optional(),
  forecastCoverageDays: z.number().int().min(1).max(60).optional(),
  forecastSafetyDays: z.number().int().min(0).max(30).optional(),
  whatsappUpdates: z.boolean().optional(),
  whatsappOrderApproval: z.boolean().optional(),
});

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
        shiftReportWindowEndAt: true,
        apiKey: true,
        posWebhookSecret: true,
        adminWhatsappNumber: true,
        paymentReminderDays: true,
        forecastCoverageDays: true,
        forecastSafetyDays: true,
        whatsappUpdates: true,
        whatsappOrderApproval: true,
        plan: true,
        outlets: true,
        setupFeeWaived: true,
        trialEndsAt: true,
        priceLockedUntil: true,
        billingStatus: true,
      },
    });
    if (!tenant) {
      return apiError("TENANT_NOT_FOUND", "Venue not found", 404);
    }

    let posWebhookSecret = tenant.posWebhookSecret?.trim() ?? "";
    if (!posWebhookSecret) {
      posWebhookSecret = randomBytes(32).toString("hex");
      await prisma.tenant.update({
        where: { id: tenant.id },
        data: { posWebhookSecret },
      });
    }

    return apiOk({
      ...tenant,
      posWebhookSecret,
      shiftSchedule: parseShiftSchedule(tenant.shiftSchedule),
      whatsappConnected: isWhatsAppConfigured(),
      whatsappEnabled: isWhatsAppEnabled(),
      monthlyPriceFromJanuary: monthlyPriceFromJanuaryInr({
        plan: tenant.plan,
        outlets: tenant.outlets,
        setupFeeWaived: tenant.setupFeeWaived,
      }),
    });
  } catch (error) {
    return apiError("SETTINGS_FETCH_FAILED", "Failed to fetch settings", 500, {
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

export async function PATCH(request: NextRequest) {
  const session = await requireApiSession(request);
  if (!isSession(session)) return session;

  try {
    const payload = patchSchema.parse(await request.json());

    let adminWhatsappNumber: string | null | undefined;
    if (payload.adminWhatsappNumber !== undefined) {
      const raw = payload.adminWhatsappNumber?.trim() ?? "";
      if (!raw) {
        adminWhatsappNumber = null;
      } else {
        const normalized = normalizeIndianPhone(raw);
        if (!normalized) {
          return apiError("INVALID_ADMIN_WHATSAPP", INDIAN_PHONE_ERROR, 400, {
            field: "adminWhatsappNumber",
          });
        }
        adminWhatsappNumber = normalized;
      }
    }

    if (payload.shiftSchedule) {
      for (const key of DAY_KEYS) {
        const day = payload.shiftSchedule[key];
        if (!day) continue;
        const hasStart = Boolean(day.start);
        const hasEnd = Boolean(day.end);
        if (hasStart !== hasEnd) {
          return apiError(
            "INVALID_SHIFT_SCHEDULE",
            `${key}: both start and end are required when setting shift times`,
            400,
          );
        }
        if (hasStart && hasEnd && day.start === day.end) {
          return apiError(
            "INVALID_SHIFT_SCHEDULE",
            `${key}: start and end cannot be the same`,
            400,
          );
        }
      }
    }

    const current = await prisma.tenant.findUnique({
      where: { id: session.tenantId },
      select: { whatsappUpdates: true, adminWhatsappNumber: true },
    });
    if (!current) {
      return apiError("TENANT_NOT_FOUND", "Venue not found", 404);
    }

    const nextNumber =
      adminWhatsappNumber !== undefined ? adminWhatsappNumber : current.adminWhatsappNumber;
    const hasNumber = Boolean(nextNumber?.trim());
    let nextUpdates = payload.whatsappUpdates;
    let nextApproval = payload.whatsappOrderApproval;
    if (!hasNumber) {
      nextUpdates = false;
      nextApproval = false;
    } else if (nextUpdates === false) {
      nextApproval = false;
    } else if (nextApproval === true && !(nextUpdates ?? current.whatsappUpdates)) {
      nextApproval = false;
    }

    const updated = await prisma.tenant.update({
      where: { id: session.tenantId },
      data: {
        ...(payload.slippageTolerancePercent !== undefined
          ? { slippageTolerancePercent: payload.slippageTolerancePercent }
          : {}),
        ...(payload.shiftSchedule !== undefined
          ? { shiftSchedule: payload.shiftSchedule }
          : {}),
        ...(adminWhatsappNumber !== undefined
          ? { adminWhatsappNumber }
          : {}),
        ...(payload.paymentReminderDays !== undefined
          ? { paymentReminderDays: payload.paymentReminderDays }
          : {}),
        ...(payload.forecastCoverageDays !== undefined
          ? { forecastCoverageDays: payload.forecastCoverageDays }
          : {}),
        ...(payload.forecastSafetyDays !== undefined
          ? { forecastSafetyDays: payload.forecastSafetyDays }
          : {}),
        ...(nextUpdates !== undefined ? { whatsappUpdates: nextUpdates } : {}),
        ...(nextApproval !== undefined ? { whatsappOrderApproval: nextApproval } : {}),
      },
      select: {
        slippageTolerancePercent: true,
        shiftSchedule: true,
        adminWhatsappNumber: true,
        paymentReminderDays: true,
        forecastCoverageDays: true,
        forecastSafetyDays: true,
        whatsappUpdates: true,
        whatsappOrderApproval: true,
      },
    });
    revalidateForecastCache(session.tenantId);
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
