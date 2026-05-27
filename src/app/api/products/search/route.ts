import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { isSession, requireApiSession } from "@/lib/auth/require-session";

export async function GET(request: NextRequest) {
  const session = await requireApiSession(request);
  if (!isSession(session)) return session;

  const query = request.nextUrl.searchParams.get("q") ?? "";

  const products = await prisma.product.findMany({
    where: {
      tenantId: session.tenantId,
      name: {
        contains: query,
        mode: "insensitive",
      },
    },
    orderBy: { name: "asc" },
    take: 20,
  });

  return Response.json({ products });
}
