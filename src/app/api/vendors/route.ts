import { NextRequest } from "next/server";
import { unstable_cache, revalidateTag } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError, apiOk } from "@/lib/http";
import { isSession, requireApiSession } from "@/lib/auth/require-session";
import { INDIAN_PHONE_ERROR, normalizeIndianPhone } from "@/lib/phone-in";

const getCachedVendorsLean = unstable_cache(
  async (tenantId: string) =>
    prisma.vendor.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ["vendors-lean"],
  { tags: ["vendors"], revalidate: 60 },
);

const getCachedVendorsFull = unstable_cache(
  async (tenantId: string) =>
    prisma.vendor.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
      include: {
        products: {
          select: { id: true, name: true, sku: true },
          orderBy: { name: "asc" },
        },
      },
    }),
  ["vendors-full"],
  { tags: ["vendors"], revalidate: 60 },
);

export async function GET(request: NextRequest) {
  const session = await requireApiSession(request);
  if (!isSession(session)) return session;

  try {
    const fields = request.nextUrl.searchParams.get("fields");
    const lean = fields === "id,name";
    const vendors = lean
      ? await getCachedVendorsLean(session.tenantId)
      : await getCachedVendorsFull(session.tenantId);
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
    const whatsappNumber = normalizeIndianPhone(payload.whatsappNumber);
    if (!whatsappNumber) {
      return apiError("INVALID_WHATSAPP", INDIAN_PHONE_ERROR, 400, {
        field: "whatsappNumber",
      });
    }
    const vendor = await prisma.vendor.create({
      data: {
        tenantId: session.tenantId,
        name: payload.name.trim(),
        whatsappNumber,
      },
    });
    revalidateTag("vendors", { expire: 0 });
    return apiOk({ vendor }, 201);
  } catch (error) {
    return apiError("VENDOR_CREATE_FAILED", "Failed to create vendor", 400, {
      message: error instanceof Error ? error.message : "Invalid request",
    });
  }
}
