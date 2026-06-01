import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError, apiOk } from "@/lib/http";
import { isSession, requireApiSession } from "@/lib/auth/require-session";

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
    const vendor = await prisma.vendor.update({
      where: { id },
      data: {
        ...(payload.name !== undefined ? { name: payload.name.trim() } : {}),
        ...(payload.whatsappNumber !== undefined
          ? { whatsappNumber: payload.whatsappNumber.trim() }
          : {}),
      },
    });
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
    return apiOk({ deleted: true, id });
  } catch (error) {
    return apiError("VENDOR_DELETE_FAILED", "Failed to delete vendor", 400, {
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
