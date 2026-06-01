import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError, apiOk } from "@/lib/http";
import { isSession, requireApiSession } from "@/lib/auth/require-session";

export async function GET(request: NextRequest) {
  const session = await requireApiSession(request);
  if (!isSession(session)) return session;

  try {
    const vendors = await prisma.vendor.findMany({
      where: { tenantId: session.tenantId },
      orderBy: { name: "asc" },
      include: {
        products: {
          select: { id: true, name: true, sku: true },
          orderBy: { name: "asc" },
        },
      },
    });
    return apiOk({ vendors });
  } catch (error) {
    return apiError("VENDORS_FETCH_FAILED", "Failed to fetch vendors", 500, {
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

const createSchema = z.object({
  name: z.string().min(1),
  whatsappNumber: z.string().min(5),
});

export async function POST(request: NextRequest) {
  const session = await requireApiSession(request);
  if (!isSession(session)) return session;

  try {
    const payload = createSchema.parse(await request.json());
    const vendor = await prisma.vendor.create({
      data: {
        tenantId: session.tenantId,
        name: payload.name.trim(),
        whatsappNumber: payload.whatsappNumber.trim(),
      },
    });
    return apiOk({ vendor }, 201);
  } catch (error) {
    return apiError("VENDOR_CREATE_FAILED", "Failed to create vendor", 400, {
      message: error instanceof Error ? error.message : "Invalid request",
    });
  }
}
