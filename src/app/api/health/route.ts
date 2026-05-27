import { prisma } from "@/lib/prisma";
import { apiError, apiOk } from "@/lib/http";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return apiOk({
      status: "ok",
      db: "connected",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return apiError("DB_UNAVAILABLE", "Database health check failed", 503, {
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

