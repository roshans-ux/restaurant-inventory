import { NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError, apiOk } from "@/lib/http";
import { isSession, requireApiSession } from "@/lib/auth/require-session";
import { INDIAN_PHONE_ERROR, normalizeIndianPhone } from "@/lib/phone-in";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  whatsappNumber: z.string().min(5).optional(),
});

export async function PATCH(request: NextRequest, { params }: Params) {
  const session = await requireApiSession(request);
  if (!isSession(session)) return session;

  try {
    const { id } = await params;
    const existing = await prisma.vendor.findFirst({
      where: { id, tenantId: session.tenantId },
    });
    if (!existing) {
      return apiError("VENDOR_NOT_FOUND", "Vendor not found", 404);
    }

    const payload = patchSchema.parse(await request.json());
    let whatsappNumber: string | undefined;
    if (payload.whatsappNumber !== undefined) {
      const normalized = normalizeIndianPhone(payload.whatsappNumber);
      if (!normalized) {
        return apiError("INVALID_WHATSAPP", INDIAN_PHONE_ERROR, 400, {
          field: "whatsappNumber",
        });
      }
      whatsappNumber = normalized;
    }
    const vendor = await prisma.vendor.update({
      where: { id },
      data: {
        ...(payload.name !== undefined ? { name: payload.name.trim() } : {}),
        ...(whatsappNumber !== undefined ? { whatsappNumber } : {}),
      },
    });
    revalidateTag("vendors", { expire: 0 });
    return apiOk({ vendor });
  } catch (error) {
    return apiError("VENDOR_UPDATE_FAILED", "Failed to update vendor", 400, {
      message: error instanceof Error ? error.message : "Invalid request",
    });
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const session = await requireApiSession(request);
  if (!isSession(session)) return session;

  try {
    const { id } = await params;
    const existing = await prisma.vendor.findFirst({
      where: { id, tenantId: session.tenantId },
    });
    if (!existing) {
      return apiError("VENDOR_NOT_FOUND", "Vendor not found", 404);
    }

    await prisma.vendor.delete({ where: { id } });
    revalidateTag("vendors", { expire: 0 });
    return apiOk({ deleted: true, id });
  } catch (error) {
    return apiError("VENDOR_DELETE_FAILED", "Failed to delete vendor", 400, {
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
