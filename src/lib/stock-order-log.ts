import type { Prisma } from "@prisma/client";

type Db = Pick<Prisma.TransactionClient, "stockOrderLog">;

export async function appendStockOrderLog(
  db: Db,
  stockOrderId: string,
  message: string,
) {
  await db.stockOrderLog.create({
    data: { stockOrderId, message },
  });
}
