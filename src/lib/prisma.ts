import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

/** Bump when schema/delegates change so dev hot-reload does not keep a stale client. */
const PRISMA_CLIENT_GENERATION = "2026-05-tenant-auth-v2";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaGeneration?: string;
};

function createPrismaClient(): PrismaClient {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }
  if (databaseUrl.startsWith("file:")) {
    throw new Error(
      "DATABASE_URL must be a PostgreSQL URL (e.g. postgresql://inventory:inventory@localhost:5432/restaurant_inventory). " +
        "Run `docker compose up -d` and update .env — see README.md.",
    );
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

function isValidCachedClient(client: PrismaClient | undefined): client is PrismaClient {
  return (
    client !== undefined &&
    globalForPrisma.prismaGeneration === PRISMA_CLIENT_GENERATION &&
    typeof client.user?.findFirst === "function"
  );
}

export function getPrismaClient(): PrismaClient {
  if (isValidCachedClient(globalForPrisma.prisma)) {
    return globalForPrisma.prisma;
  }

  const client = createPrismaClient();
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client;
    globalForPrisma.prismaGeneration = PRISMA_CLIENT_GENERATION;
  }
  return client;
}

/**
 * Lazy proxy so route modules can load before Prisma connects.
 * Errors surface on first query and can be caught in route handlers.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrismaClient();
    const value = Reflect.get(client, prop, client) as unknown;
    if (typeof value === "function") {
      return (value as (...args: unknown[]) => unknown).bind(client);
    }
    return value;
  },
});
