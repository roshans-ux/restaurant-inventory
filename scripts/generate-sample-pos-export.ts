import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { mkdirSync, writeFileSync } from "fs";
import { getPrismaClient } from "../src/lib/prisma";
import { isPosItemConfigured } from "../src/lib/pos-mapping-utils";

const prisma = getPrismaClient();

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function dmy(d: Date) {
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

async function main() {
  const tenant = await prisma.tenant.findFirst({
    where: { OR: [{ name: "Fresh Bar" }, { slug: { startsWith: "fresh-bar" } }] },
    select: { id: true, name: true },
  });
  if (!tenant) throw new Error("Fresh Bar tenant not found");

  const mappings = await prisma.posMenuMapping.findMany({
    where: { tenantId: tenant.id },
    select: {
      posItemId: true,
      pourMl: true,
      product: { select: { name: true, sku: true } },
    },
  });
  const configured = mappings.filter((m) => isPosItemConfigured(m.posItemId) && m.posItemId);
  const byProduct = new Map<string, typeof configured>();
  for (const row of configured) {
    const list = byProduct.get(row.product.name) ?? [];
    list.push(row);
    byProduct.set(row.product.name, list);
  }

  const named = [...byProduct.entries()].map(([name, rows]) => {
    const preferred =
      rows.find((r) => Number(r.pourMl) === 30) ?? rows[0]!;
    return { name, pos: preferred.posItemId!, unique: rows.length === 1 };
  });

  const items: { item: string; pos: string }[] = [];
  for (const row of named.slice(0, 10)) {
    items.push({ item: row.name, pos: row.pos });
    items.push({ item: row.name.toLowerCase(), pos: row.unique ? row.pos : "" });
    items.push({ item: row.pos, pos: row.pos });
  }

  const unmatched = ["House Special Mocktail", "Nachos Platter", "Cigarette Pack"];
  const start = new Date(Date.UTC(2026, 7, 27));
  const rows = [["Bill No", "Bill Date", "Bill Time", "Item", "POS Code", "Qty"]];
  let bill = 10021;
  for (let day = 0; day < 30; day++) {
    const d = new Date(start.getTime() + day * 86400000);
    const n = 3 + (day % 3);
    for (let i = 0; i < n; i++) {
      const it = items[(day + i) % items.length]!;
      const hour = 18 + ((day + i) % 5);
      const min = (i * 17) % 60;
      bill += 1;
      rows.push([
        `B-${bill}`,
        dmy(d),
        `${pad(hour)}:${pad(min)}`,
        it.item,
        it.pos,
        String(1 + ((day + i) % 3)),
      ]);
    }
    if (day % 10 === 0) {
      const u = unmatched[day / 10]!;
      bill += 1;
      rows.push([`B-${bill}`, dmy(d), "21:40", u, "", "2"]);
    }
  }

  const csv = rows.map((r) => r.map((c) => (c.includes(",") ? `"${c}"` : c)).join(",")).join("\n") + "\n";
  mkdirSync("public/samples", { recursive: true });
  writeFileSync("public/samples/sample-pos-export.csv", csv);
  console.log(JSON.stringify({ tenant: tenant.name, rows: rows.length - 1, named: named.length }));
}

main().finally(() => prisma.$disconnect());
