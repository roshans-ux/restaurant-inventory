/**
 * Dev-only 120-day sales seed. Writes the same PosSale / PosSaleLine / StockMovement
 * rows the POS webhook produces, plus matching RECEIVE movements so stock stays positive.
 *
 *   npm run seed:sales -- --tenant "Venue Name"
 *   npm run seed:sales -- --tenant "Venue Name" --clear
 *   npm run seed:sales -- --tenant "Venue Name" --catalog-only
 */
import { existsSync, readFileSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import {
  ProductCategory,
  QuantityUnit,
  StockMovementType,
  UserRole,
  type Prisma,
} from "@prisma/client";
import { hashPassword } from "../src/lib/auth/password";
import { slugFromRestaurantName } from "../src/lib/auth/build-session";
import { stockGuardReserveMl } from "../src/lib/inventory";
import {
  defaultPourMlForCategory,
  isFullUnitSaleProduct,
} from "../src/lib/product-category";
import { isPosItemConfigured } from "../src/lib/pos-mapping-utils";
import { getPrismaClient } from "../src/lib/prisma";

const SEED_SOURCE = "SEED";
const SEED_PREFIX = "SEED-";
const ADMIN_EMAIL = "demo@bartally.in";
const CATALOG_ONLY_ADMIN_EMAIL = "demo2@bartally.in";
const DAYS = 120;
const BATCH = 500;
const PROGRESS_EVERY_DAYS = 10;
const DEV_BRANCH_MARKER = "ep-spring-frog";

const WEEKDAY_MULT = [1.2, 0.6, 0.6, 1, 1, 1.6, 1.8] as const; // Sun–Sat

type Popularity = "fast" | "medium" | "slow";

const POPULARITY_BASE: Record<Popularity, number> = {
  fast: 12,
  medium: 5,
  slow: 1.6,
};

type CatalogSku = {
  name: string;
  sku: string;
  category: ProductCategory;
  bottleSizeMl: number;
  popularity: Popularity;
  vendorIndex: number;
};

const CATALOG: CatalogSku[] = [
  { name: "Johnnie Walker Black Label", sku: "SEED-JW-BLK-750", category: ProductCategory.SPIRIT, bottleSizeMl: 750, popularity: "fast", vendorIndex: 0 },
  { name: "Jack Daniel's Tennessee Whiskey", sku: "SEED-JD-750", category: ProductCategory.SPIRIT, bottleSizeMl: 750, popularity: "fast", vendorIndex: 0 },
  { name: "Absolut Vodka", sku: "SEED-ABS-750", category: ProductCategory.SPIRIT, bottleSizeMl: 750, popularity: "fast", vendorIndex: 0 },
  { name: "Smirnoff Vodka", sku: "SEED-SMIR-750", category: ProductCategory.SPIRIT, bottleSizeMl: 750, popularity: "fast", vendorIndex: 0 },
  { name: "Old Monk Rum", sku: "SEED-OM-750", category: ProductCategory.SPIRIT, bottleSizeMl: 750, popularity: "fast", vendorIndex: 0 },
  { name: "Bacardi Carta Blanca", sku: "SEED-BAC-750", category: ProductCategory.SPIRIT, bottleSizeMl: 750, popularity: "medium", vendorIndex: 0 },
  { name: "Blenders Pride", sku: "SEED-BP-750", category: ProductCategory.SPIRIT, bottleSizeMl: 750, popularity: "medium", vendorIndex: 0 },
  { name: "Royal Challenge", sku: "SEED-RC-750", category: ProductCategory.SPIRIT, bottleSizeMl: 750, popularity: "medium", vendorIndex: 0 },
  { name: "Jameson Irish Whiskey", sku: "SEED-JAM-750", category: ProductCategory.SPIRIT, bottleSizeMl: 750, popularity: "medium", vendorIndex: 0 },
  { name: "Tanqueray London Dry Gin", sku: "SEED-TQ-750", category: ProductCategory.SPIRIT, bottleSizeMl: 750, popularity: "slow", vendorIndex: 0 },
  { name: "Sula Chenin Blanc", sku: "SEED-SULA-CB-750", category: ProductCategory.WINE, bottleSizeMl: 750, popularity: "medium", vendorIndex: 2 },
  { name: "Grover Art Collection Red", sku: "SEED-GROV-750", category: ProductCategory.WINE, bottleSizeMl: 750, popularity: "slow", vendorIndex: 2 },
  { name: "Fratelli Sangiovese", sku: "SEED-FRAT-750", category: ProductCategory.WINE, bottleSizeMl: 750, popularity: "slow", vendorIndex: 2 },
  { name: "Jacob's Creek Shiraz", sku: "SEED-JC-SHZ-750", category: ProductCategory.WINE, bottleSizeMl: 750, popularity: "medium", vendorIndex: 2 },
  { name: "Kingfisher Premium", sku: "SEED-KF-PREM-650", category: ProductCategory.BOTTLED_BEER, bottleSizeMl: 650, popularity: "fast", vendorIndex: 1 },
  { name: "Kingfisher Ultra", sku: "SEED-KF-ULT-330", category: ProductCategory.BOTTLED_BEER, bottleSizeMl: 330, popularity: "fast", vendorIndex: 1 },
  { name: "Budweiser", sku: "SEED-BUD-330", category: ProductCategory.BOTTLED_BEER, bottleSizeMl: 330, popularity: "fast", vendorIndex: 1 },
  { name: "Heineken", sku: "SEED-HEI-330", category: ProductCategory.BOTTLED_BEER, bottleSizeMl: 330, popularity: "medium", vendorIndex: 1 },
  { name: "Corona Extra", sku: "SEED-COR-330", category: ProductCategory.BOTTLED_BEER, bottleSizeMl: 330, popularity: "medium", vendorIndex: 1 },
  { name: "Bira 91 White", sku: "SEED-BIRA-W-330", category: ProductCategory.BOTTLED_BEER, bottleSizeMl: 330, popularity: "medium", vendorIndex: 1 },
  { name: "Kingfisher Draft", sku: "SEED-KF-DRAFT-30L", category: ProductCategory.DRAFT_BEER, bottleSizeMl: 30000, popularity: "fast", vendorIndex: 1 },
  { name: "Bira 91 Blonde Keg", sku: "SEED-BIRA-KEG-20L", category: ProductCategory.DRAFT_BEER, bottleSizeMl: 20000, popularity: "medium", vendorIndex: 1 },
  { name: "Hoegaarden Draft", sku: "SEED-HOEG-KEG-20L", category: ProductCategory.DRAFT_BEER, bottleSizeMl: 20000, popularity: "slow", vendorIndex: 1 },
  { name: "Somersby Apple Cider", sku: "SEED-SOM-330", category: ProductCategory.CIDER, bottleSizeMl: 330, popularity: "medium", vendorIndex: 1 },
  { name: "Kopparberg Mixed Fruit", sku: "SEED-KOPP-330", category: ProductCategory.CIDER, bottleSizeMl: 330, popularity: "slow", vendorIndex: 1 },
];

const VENDORS = [
  { name: "Deccan Spirits Distributors", email: "seed-deccan@bartally.in", whatsappNumber: "+919800000001", creditPeriodDays: 14 },
  { name: "Coastal Beer & Cider Co", email: "seed-coastal@bartally.in", whatsappNumber: "+919800000002", creditPeriodDays: 7 },
  { name: "Sahyadri Wine Cellars", email: "seed-sahyadri@bartally.in", whatsappNumber: "+919800000003", creditPeriodDays: 21 },
] as const;

function loadEnvFile(path: string, override: boolean) {
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (override || process.env[key] == null) process.env[key] = value;
  }
}

loadEnvFile(resolve(process.cwd(), ".env"), false);
loadEnvFile(resolve(process.cwd(), ".env.local"), true);

function parseArgs(argv: string[]) {
  let tenant: string | undefined;
  let clear = false;
  let catalogOnly = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--tenant" || arg === "-t") {
      tenant = argv[++i];
    } else if (arg.startsWith("--tenant=")) {
      tenant = arg.slice("--tenant=".length);
    } else if (arg === "--clear") {
      clear = true;
    } else if (arg === "--catalog-only") {
      catalogOnly = true;
    }
  }
  return { tenant: tenant?.trim(), clear, catalogOnly };
}

function assertDevSafe() {
  if (process.env.NODE_ENV === "production") {
    console.error("Refusing to run: NODE_ENV is production. This script is dev-only.");
    process.exit(1);
  }
  const databaseUrl = process.env.DATABASE_URL ?? "";
  if (!databaseUrl.includes(DEV_BRANCH_MARKER)) {
    console.error(
      `Refusing to run: DATABASE_URL is not the Neon dev branch (must contain "${DEV_BRANCH_MARKER}").`,
    );
    process.exit(1);
  }
}

function mulberry32(seed: number) {
  return function rng() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const next = new Date(Date.UTC(y, (m ?? 1) - 1, (d ?? 1) + days));
  return next.toISOString().slice(0, 10);
}

function weekdayUtcDate(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1)).getUTCDay();
}

function todayIstIso(): string {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}

/** Evening service window: 19:00–01:00 IST (13:30–19:30 UTC). */
function soldAtOnDay(iso: string, rng: () => number): Date {
  const [y, m, d] = iso.split("-").map(Number);
  const minutes = Math.floor(rng() * 6 * 60);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, 13, 30, 0) + minutes * 60_000);
}

function morningOnDay(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, 3, 0, 0));
}

function generatePassword(): string {
  const raw = randomBytes(6).toString("base64url").replace(/[^a-zA-Z0-9]/g, "x");
  return `BarTally-${raw.slice(0, 8)}`;
}

function salePoursForProduct(category: ProductCategory, bottleSizeMl: number): number[] {
  if (category === ProductCategory.SPIRIT) return [30, 60, 90];
  if (category === ProductCategory.WINE) return [120];
  if (category === ProductCategory.DRAFT_BEER) return [250, 330, 450, 1000];
  if (isFullUnitSaleProduct(category, bottleSizeMl)) return [bottleSizeMl];
  return [defaultPourMlForCategory(category, bottleSizeMl)];
}

function pickWeighted<T extends { w: number }>(items: T[], rng: () => number): T {
  const total = items.reduce((sum, item) => sum + item.w, 0);
  let roll = rng() * total;
  for (const item of items) {
    roll -= item.w;
    if (roll <= 0) return item;
  }
  return items[items.length - 1]!;
}

function popularityForName(name: string, fallbackIndex: number): Popularity {
  const lower = name.toLowerCase();
  if (
    /johnnie|jack daniel|absolut|smirnoff|old monk|kingfisher|budweiser|bira/.test(
      lower,
    )
  ) {
    return "fast";
  }
  if (/tanqueray|grover|fratelli|hoegaarden|kopparberg|sauvignon/.test(lower)) {
    return "slow";
  }
  const cycle: Popularity[] = ["fast", "medium", "slow"];
  return cycle[fallbackIndex % cycle.length]!;
}

async function createManyInBatches<T extends object>(
  rows: T[],
  write: (chunk: T[]) => Promise<unknown>,
) {
  for (let i = 0; i < rows.length; i += BATCH) {
    await write(rows.slice(i, i + BATCH));
  }
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function inDayWindow(date: Date, from: string, to: string): boolean {
  const day = isoDay(date);
  return day >= from && day <= to;
}

type SeedProduct = {
  id: string;
  name: string;
  sku: string | null;
  category: ProductCategory;
  bottleSizeMl: number;
  vendorId: string | null;
  popularity: Popularity;
};

type MappedPour = {
  productId: string;
  posItemId: string;
  pourMl: number;
};

type PlannedLine = {
  productId: string;
  posItemId: string;
  pourMl: number;
  quantity: number;
  decrementMl: number;
  soldAt: Date;
};

async function clearSeededRecords(
  prisma: ReturnType<typeof getPrismaClient>,
  tenantId: string,
) {
  const sales = await prisma.posSale.deleteMany({
    where: { tenantId, externalSaleId: { startsWith: SEED_PREFIX } },
  });

  const movements = await prisma.stockMovement.deleteMany({
    where: {
      product: { tenantId },
      metadata: { path: ["source"], equals: SEED_SOURCE },
    },
  });

  const mappings = await prisma.posMenuMapping.deleteMany({
    where: { tenantId, posItemId: { startsWith: SEED_PREFIX } },
  });

  const seedProducts = await prisma.product.findMany({
    where: { tenantId, sku: { startsWith: SEED_PREFIX } },
    select: { id: true },
  });
  const productIds = seedProducts.map((p) => p.id);

  if (productIds.length > 0) {
    await prisma.posSaleLine.deleteMany({
      where: { productId: { in: productIds } },
    });
    await prisma.stockMovement.deleteMany({
      where: { productId: { in: productIds } },
    });
    await prisma.alert.deleteMany({
      where: { productId: { in: productIds } },
    });
    await prisma.product.deleteMany({
      where: { id: { in: productIds } },
    });
  }

  const vendors = await prisma.vendor.deleteMany({
    where: {
      tenantId,
      email: { startsWith: "seed-" },
      products: { none: {} },
      primaryProducts: { none: {} },
    },
  });

  console.log(
    `Cleared seeded records: ${sales.count} sales, ${movements.count} stock movements, ${mappings.count} mappings, ${productIds.length} products, ${vendors.count} vendors.`,
  );
}

async function findTenant(
  prisma: ReturnType<typeof getPrismaClient>,
  tenantName: string,
) {
  const slug = slugFromRestaurantName(tenantName);
  const matches = await prisma.tenant.findMany({
    where: {
      OR: [
        { name: tenantName },
        { name: { equals: tenantName, mode: "insensitive" } },
        { slug },
      ],
    },
  });
  return (
    matches.find((t) => t.name === tenantName) ??
    matches.find((t) => t.name.toLowerCase() === tenantName.toLowerCase()) ??
    matches[0] ??
    null
  );
}

async function ensureAdminUser(
  prisma: ReturnType<typeof getPrismaClient>,
  tenantId: string,
  email: string,
  options?: { resetPassword?: boolean },
): Promise<{ email: string; password: string | null; created: boolean }> {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && existing.tenantId !== tenantId) {
    throw new Error(
      `${email} already belongs to another tenant. Pick a different venue or free that email.`,
    );
  }
  if (existing) {
    if (options?.resetPassword) {
      const password = generatePassword();
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          passwordHash: hashPassword(password),
          emailVerifiedAt: existing.emailVerifiedAt ?? new Date(),
          role: UserRole.OWNER,
        },
      });
      return { email, password, created: false };
    }
    await prisma.user.update({
      where: { id: existing.id },
      data: { emailVerifiedAt: existing.emailVerifiedAt ?? new Date(), role: UserRole.OWNER },
    });
    return { email, password: null, created: false };
  }

  const password = generatePassword();
  await prisma.user.create({
    data: {
      tenantId,
      email,
      phone: "+919800000000",
      passwordHash: hashPassword(password),
      name: "Seed Admin",
      role: UserRole.OWNER,
      emailVerifiedAt: new Date(),
    },
  });
  return { email, password, created: true };
}

function openingBottlesForSku(sku: string, popularity: Popularity): number {
  const h = hashSeed(`${sku}:opening`);
  if (popularity === "fast") return 18 + (h % 7);
  if (popularity === "medium") return 10 + (h % 7);
  return 6 + (h % 5);
}

async function seedCatalog(
  prisma: ReturnType<typeof getPrismaClient>,
  tenantId: string,
) {
  const vendors = [];
  for (const vendor of VENDORS) {
    const existing = await prisma.vendor.findFirst({
      where: { tenantId, email: vendor.email },
    });
    vendors.push(
      existing ??
        (await prisma.vendor.create({
          data: {
            tenantId,
            name: vendor.name,
            email: vendor.email,
            whatsappNumber: vendor.whatsappNumber,
            creditPeriodDays: vendor.creditPeriodDays,
          },
        })),
    );
  }

  for (const sku of CATALOG) {
    const vendor = vendors[sku.vendorIndex]!;
    const existing = await prisma.product.findFirst({
      where: { tenantId, sku: sku.sku },
    });
    if (existing) continue;

    const product = await prisma.product.create({
      data: {
        tenantId,
        vendorId: vendor.id,
        name: sku.name,
        sku: sku.sku,
        category: sku.category,
        bottleSizeMl: sku.bottleSizeMl,
        defaultPourMl: isFullUnitSaleProduct(sku.category, sku.bottleSizeMl)
          ? sku.bottleSizeMl
          : defaultPourMlForCategory(sku.category, sku.bottleSizeMl),
        parLevelBottles: sku.popularity === "fast" ? 6 : sku.popularity === "medium" ? 3 : 2,
        vendors: { connect: { id: vendor.id } },
        reorderConfig: {
          create: {
            thresholdBottles: sku.popularity === "fast" ? 3 : 1,
            reorderQuantity: sku.category === ProductCategory.DRAFT_BEER ? 1 : 6,
            notifyAdmin: true,
          },
        },
      },
    });

    const pours = salePoursForProduct(sku.category, sku.bottleSizeMl);
    await prisma.posMenuMapping.createMany({
      data: pours.map((pourMl) => ({
        tenantId,
        productId: product.id,
        posItemId: `${SEED_PREFIX}${sku.sku}-${pourMl}`,
        pourMl,
      })),
    });
  }

  console.log(`Catalog ready: ${CATALOG.length} SKUs, ${vendors.length} vendors.`);
}

async function createTenant(
  prisma: ReturnType<typeof getPrismaClient>,
  tenantName: string,
) {
  const slugBase = slugFromRestaurantName(tenantName);
  const tenant = await prisma.tenant.create({
    data: {
      name: tenantName,
      slug: `${slugBase}-${randomUUID().slice(0, 6)}`,
      location: "Bengaluru",
      heardAboutUs: "Seed script",
      onboardingCompletedAt: new Date(),
      posWebhookSecret: process.env.POS_WEBHOOK_SECRET ?? "dev-secret",
    },
  });
  await seedCatalog(prisma, tenant.id);
  console.log(`Created tenant "${tenant.name}".`);
  return tenant;
}

async function ensureCatalogMappings(
  prisma: ReturnType<typeof getPrismaClient>,
  tenantId: string,
  products: SeedProduct[],
) {
  for (const product of products) {
    const pours = salePoursForProduct(product.category, product.bottleSizeMl);
    const existing = await prisma.posMenuMapping.findMany({
      where: { tenantId, productId: product.id },
    });
    const byPour = new Map(existing.map((row) => [Number(row.pourMl), row]));
    const sku = product.sku ?? product.id.slice(0, 8);

    for (const pourMl of pours) {
      const row = byPour.get(pourMl);
      const seedPosItemId = `${SEED_PREFIX}${sku}-${pourMl}`;
      if (!row) {
        await prisma.posMenuMapping.create({
          data: { tenantId, productId: product.id, posItemId: seedPosItemId, pourMl },
        });
        continue;
      }
      if (!isPosItemConfigured(row.posItemId)) {
        await prisma.posMenuMapping.update({
          where: { id: row.id },
          data: { posItemId: seedPosItemId },
        });
      }
    }
  }
}

function assignPopularity(products: SeedProduct[]): SeedProduct[] {
  return products.map((product, index) => ({
    ...product,
    popularity: popularityForName(product.name, index),
  }));
}

function pickSalePours(
  category: ProductCategory,
  mapped: MappedPour[],
  rng: () => number,
): MappedPour {
  if (mapped.length === 1) return mapped[0]!;
  if (category === ProductCategory.SPIRIT) {
    const weights = mapped.map((m) => ({
      m,
      w: m.pourMl === 30 ? 0.5 : m.pourMl === 60 ? 0.35 : m.pourMl === 90 ? 0.15 : 0.05,
    }));
    return pickWeighted(weights, rng).m;
  }
  if (category === ProductCategory.DRAFT_BEER) {
    const weights = mapped.map((m) => ({
      m,
      w: m.pourMl === 330 ? 0.45 : m.pourMl === 250 ? 0.2 : m.pourMl === 450 ? 0.25 : 0.1,
    }));
    return pickWeighted(weights, rng).m;
  }
  return mapped[Math.floor(rng() * mapped.length)]!;
}

function planCalendar(rng: () => number) {
  const end = addDays(todayIstIso(), -1);
  const start = addDays(end, -(DAYS - 1));
  const days: string[] = [];
  for (let i = 0; i < DAYS; i++) days.push(addDays(start, i));

  const used = new Set<string>();
  const spikes: { start: string; days: number; mult: number }[] = [];
  for (let s = 0; s < 2; s++) {
    const length = rng() < 0.5 ? 2 : 3;
    const offset = 10 + Math.floor(rng() * (DAYS - length - 20));
    const spikeStart = days[offset]!;
    const mult = 1.5 + rng() * 0.5;
    spikes.push({ start: spikeStart, days: length, mult });
    for (let i = 0; i < length; i++) used.add(addDays(spikeStart, i));
  }

  const dryDays: string[] = [];
  while (dryDays.length < 2) {
    const candidate = days[8 + Math.floor(rng() * (DAYS - 16))]!;
    if (used.has(candidate) || dryDays.includes(candidate)) continue;
    dryDays.push(candidate);
    used.add(candidate);
  }

  const spikeByDay = new Map<string, number>();
  for (const spike of spikes) {
    for (let i = 0; i < spike.days; i++) {
      spikeByDay.set(addDays(spike.start, i), spike.mult);
    }
  }

  return { start, end, days, spikes, dryDays, spikeByDay };
}

function planSales(args: {
  products: SeedProduct[];
  mappingsByProduct: Map<string, MappedPour[]>;
  calendar: ReturnType<typeof planCalendar>;
  rng: () => number;
}): PlannedLine[] {
  const lines: PlannedLine[] = [];

  for (const day of args.calendar.days) {
    if (args.calendar.dryDays.includes(day)) continue;
    const weekdayMult = WEEKDAY_MULT[weekdayUtcDate(day)] ?? 1;
    const spikeMult = args.calendar.spikeByDay.get(day) ?? 1;

    for (const product of args.products) {
      const mapped = args.mappingsByProduct.get(product.id) ?? [];
      if (mapped.length === 0) continue;

      const noise = 0.85 + args.rng() * 0.3;
      const expected =
        POPULARITY_BASE[product.popularity] * weekdayMult * spikeMult * noise;
      let units = Math.round(expected);
      if (units === 0 && args.rng() < expected) units = 1;
      if (product.popularity === "slow" && args.rng() < 0.35) units = 0;
      if (units <= 0) continue;

      for (let i = 0; i < units; i++) {
        const mapping = pickSalePours(product.category, mapped, args.rng);
        const quantity =
          product.category === ProductCategory.BOTTLED_BEER ||
          product.category === ProductCategory.CIDER
            ? args.rng() < 0.2
              ? 2
              : 1
            : product.category === ProductCategory.SPIRIT && mapping.pourMl === 30 && args.rng() < 0.15
              ? 2
              : 1;
        const soldAt = soldAtOnDay(day, args.rng);
        lines.push({
          productId: product.id,
          posItemId: mapping.posItemId,
          pourMl: mapping.pourMl,
          quantity,
          decrementMl: Math.round(mapping.pourMl * quantity),
          soldAt,
        });
      }
    }
  }

  lines.sort((a, b) => a.soldAt.getTime() - b.soldAt.getTime());
  return lines;
}

function packTickets(lines: PlannedLine[], rng: () => number) {
  const tickets: { soldAt: Date; lines: PlannedLine[] }[] = [];
  let i = 0;
  while (i < lines.length) {
    const size = 1 + Math.floor(rng() * 4);
    const chunk = lines.slice(i, i + size);
    i += size;
    const soldAt = new Date(
      Math.min(...chunk.map((l) => l.soldAt.getTime())) + Math.floor(rng() * 90_000),
    );
    tickets.push({ soldAt, lines: chunk.map((line) => ({ ...line, soldAt })) });
  }
  return tickets;
}

function planReceipts(args: {
  products: SeedProduct[];
  lines: PlannedLine[];
  start: string;
}) {
  const byProduct = new Map<string, PlannedLine[]>();
  for (const line of args.lines) {
    const list = byProduct.get(line.productId) ?? [];
    list.push(line);
    byProduct.set(line.productId, list);
  }

  const receipts: {
    productId: string;
    vendorId: string | null;
    type: StockMovementType;
    quantityDeltaMl: number;
    quantityInput: number;
    createdAt: Date;
    fulfilmentDate: Date;
    reason: string;
  }[] = [];

  for (const product of args.products) {
    const sales = byProduct.get(product.id) ?? [];
    const reserve = stockGuardReserveMl(product.bottleSizeMl);
    const minFloor = reserve + product.bottleSizeMl;
    let running = 0;

    const firstWeekMl = sales
      .filter((s) => s.soldAt.getTime() <= morningOnDay(addDays(args.start, 7)).getTime())
      .reduce((sum, s) => sum + s.decrementMl, 0);
    const openingBottles = Math.max(
      4,
      Math.ceil((firstWeekMl + minFloor * 2) / product.bottleSizeMl),
    );
    const openingMl = openingBottles * product.bottleSizeMl;
    receipts.push({
      productId: product.id,
      vendorId: product.vendorId,
      type: StockMovementType.OPENING_BALANCE,
      quantityDeltaMl: openingMl,
      quantityInput: openingBottles,
      createdAt: morningOnDay(args.start),
      fulfilmentDate: morningOnDay(args.start),
      reason: "SEED: opening stock",
    });
    running = openingMl;

    for (const sale of sales) {
      if (running - sale.decrementMl < minFloor) {
        const lookAhead = sales
          .filter(
            (s) =>
              s.soldAt.getTime() >= sale.soldAt.getTime() &&
              s.soldAt.getTime() <= sale.soldAt.getTime() + 7 * 86_400_000,
          )
          .reduce((sum, s) => sum + s.decrementMl, 0);
        const needMl = Math.max(lookAhead + minFloor * 2 - running, product.bottleSizeMl);
        const bottles = Math.max(1, Math.ceil(needMl / product.bottleSizeMl));
        const receiveMl = bottles * product.bottleSizeMl;
        const receiptDay = addDays(sale.soldAt.toISOString().slice(0, 10), 0);
        receipts.push({
          productId: product.id,
          vendorId: product.vendorId,
          type: StockMovementType.RECEIVE,
          quantityDeltaMl: receiveMl,
          quantityInput: bottles,
          createdAt: new Date(sale.soldAt.getTime() - 60 * 60 * 1000),
          fulfilmentDate: morningOnDay(receiptDay),
          reason: "SEED: matching stock receipt",
        });
        running += receiveMl;
      }
      running -= sale.decrementMl;
    }
  }

  return receipts;
}

async function main() {
  const { tenant: tenantName, clear, catalogOnly } = parseArgs(process.argv.slice(2));
  if (!tenantName) {
    console.error(
      "Usage: npm run seed:sales -- --tenant \"Venue Name\" [--clear] [--catalog-only]",
    );
    process.exit(1);
  }

  assertDevSafe();

  const prisma = getPrismaClient();
  let createdPassword: string | null = null;
  let createdUser = false;
  const adminEmail = catalogOnly ? CATALOG_ONLY_ADMIN_EMAIL : ADMIN_EMAIL;

  try {
    let tenant = await findTenant(prisma, tenantName);
    if (clear) {
      if (!tenant) {
        console.error(`Tenant "${tenantName}" not found — nothing to clear.`);
        process.exit(1);
      }
      await clearSeededRecords(prisma, tenant.id);
    }

    tenant = await findTenant(prisma, tenantName);
    if (tenant && !clear && !catalogOnly) {
      const existingSeedSales = await prisma.posSale.count({
        where: { tenantId: tenant.id, externalSaleId: { startsWith: SEED_PREFIX } },
      });
      if (existingSeedSales > 0) {
        console.error(
          `Tenant "${tenant.name}" already has ${existingSeedSales} seeded sales. Re-run with --clear to replace them.`,
        );
        process.exit(1);
      }
    }

    let createdTenant = false;
    if (!tenant) {
      tenant = await createTenant(prisma, tenantName);
      createdTenant = true;
    } else {
      const productCount = await prisma.product.count({ where: { tenantId: tenant.id } });
      if (productCount === 0) {
        await seedCatalog(prisma, tenant.id);
      }
      if (!tenant.onboardingCompletedAt) {
        tenant = await prisma.tenant.update({
          where: { id: tenant.id },
          data: { onboardingCompletedAt: new Date() },
        });
      }
    }

    const admin = await ensureAdminUser(prisma, tenant.id, adminEmail, {
      resetPassword: catalogOnly,
    });
    createdPassword = admin.password;
    createdUser = admin.created;

    const rawProducts = await prisma.product.findMany({
      where: { tenantId: tenant.id },
      select: {
        id: true,
        name: true,
        sku: true,
        category: true,
        bottleSizeMl: true,
        vendorId: true,
      },
    });
    const products = assignPopularity(
      rawProducts.map((p) => ({
        ...p,
        bottleSizeMl: Number(p.bottleSizeMl),
        popularity: "medium" as Popularity,
      })),
    );

    await ensureCatalogMappings(prisma, tenant.id, products);

    const mappingRows = await prisma.posMenuMapping.findMany({
      where: { tenantId: tenant.id, productId: { in: products.map((p) => p.id) } },
    });
    const mappingsByProduct = new Map<string, MappedPour[]>();
    for (const row of mappingRows) {
      if (!isPosItemConfigured(row.posItemId)) continue;
      const list = mappingsByProduct.get(row.productId) ?? [];
      list.push({
        productId: row.productId,
        posItemId: row.posItemId!,
        pourMl: Number(row.pourMl),
      });
      mappingsByProduct.set(row.productId, list);
    }

    const mappedCount = [...mappingsByProduct.values()].filter((m) => m.length > 0).length;
    if (mappedCount === 0) {
      throw new Error(
        catalogOnly
          ? "No configured POS mappings on this tenant — cannot finish catalog seed."
          : "No configured POS mappings on this tenant — cannot seed sales.",
      );
    }

    if (catalogOnly) {
      const existingOpenings = await prisma.stockMovement.findMany({
        where: {
          productId: { in: products.map((p) => p.id) },
          type: StockMovementType.OPENING_BALANCE,
        },
        select: { productId: true },
      });
      const hasOpening = new Set(existingOpenings.map((row) => row.productId));
      const openingAt = morningOnDay(addDays(todayIstIso(), -1));
      const openingRows: Prisma.StockMovementCreateManyInput[] = [];
      for (const product of products) {
        if (hasOpening.has(product.id)) continue;
        const bottles = openingBottlesForSku(product.sku ?? product.id, product.popularity);
        openingRows.push({
          id: randomUUID(),
          productId: product.id,
          vendorId: product.vendorId,
          type: StockMovementType.OPENING_BALANCE,
          quantityDeltaMl: Math.round(bottles * product.bottleSizeMl),
          quantityInput: bottles,
          quantityUnit: QuantityUnit.BOTTLE,
          reason: "SEED: opening stock",
          fulfilmentDate: openingAt,
          createdAt: openingAt,
          metadata: {
            source: SEED_SOURCE,
            operation: "OPENING_BALANCE",
          },
        });
      }
      await createManyInBatches(openingRows, (data) => prisma.stockMovement.createMany({ data }));

      console.log("");
      console.log("Catalog-only seed complete (no sales).");
      console.log(`  Tenant:     ${tenant.name} (${tenant.slug})`);
      console.log(`  Created:    ${createdTenant ? "yes (new venue + catalog)" : "no (existing venue)"}`);
      console.log(`  Catalog:    ${products.length} SKUs`);
      console.log(`  Opening:    ${openingRows.length} SKUs at 6–24 bottles (skipped ${hasOpening.size} that already had opening stock)`);
      console.log(`  Admin:      ${adminEmail}`);
      if (createdPassword) {
        console.log(`  Password:   ${createdPassword}`);
      } else {
        console.log("  Password:   unchanged (user already existed)");
      }
      console.log("  Login is email-verified and approved.");
      return;
    }

    const rng = mulberry32(hashSeed(`${tenant.id}:sales-v1`));
    const calendar = planCalendar(rng);
    const planned = planSales({ products, mappingsByProduct, calendar, rng });
    const tickets = packTickets(planned, rng);
    const receipts = planReceipts({ products, lines: planned, start: calendar.start });

    const receiptRows: Prisma.StockMovementCreateManyInput[] = receipts.map((r) => ({
      id: randomUUID(),
      productId: r.productId,
      vendorId: r.vendorId,
      type: r.type,
      quantityDeltaMl: r.quantityDeltaMl,
      quantityInput: r.quantityInput,
      quantityUnit: QuantityUnit.BOTTLE,
      reason: r.reason,
      fulfilmentDate: r.fulfilmentDate,
      createdAt: r.createdAt,
      metadata: {
        source: SEED_SOURCE,
        operation: r.type === StockMovementType.OPENING_BALANCE ? "OPENING_BALANCE" : "RECEIVE_STOCK",
      },
    }));

    type TicketRows = {
      sales: Prisma.PosSaleCreateManyInput[];
      lines: Prisma.PosSaleLineCreateManyInput[];
      movements: Prisma.StockMovementCreateManyInput[];
    };

    function rowsForTickets(
      slice: typeof tickets,
      indexStart: number,
    ): TicketRows {
      const sales: Prisma.PosSaleCreateManyInput[] = [];
      const lines: Prisma.PosSaleLineCreateManyInput[] = [];
      const movements: Prisma.StockMovementCreateManyInput[] = [];

      slice.forEach((ticket, offset) => {
        const ticketIndex = indexStart + offset;
        const saleId = randomUUID();
        const externalSaleId = `${SEED_PREFIX}${isoDay(ticket.soldAt)}-${String(ticketIndex).padStart(5, "0")}`;
        sales.push({
          id: saleId,
          tenantId: tenant.id,
          externalSaleId,
          requestHash: `${SEED_PREFIX}${saleId}`,
          soldAt: ticket.soldAt,
          receivedAt: ticket.soldAt,
          createdAt: ticket.soldAt,
        });

        ticket.lines.forEach((line, lineIndex) => {
          const externalLineId = `${SEED_PREFIX}${saleId}-${lineIndex}`;
          lines.push({
            id: randomUUID(),
            posSaleId: saleId,
            productId: line.productId,
            externalLineId,
            saleEventKey: `${externalSaleId}:${externalLineId}`,
            posItemId: line.posItemId,
            quantity: line.quantity,
            pourMl: line.pourMl,
            decrementMl: line.decrementMl,
            createdAt: ticket.soldAt,
          });
          movements.push({
            id: randomUUID(),
            productId: line.productId,
            type: StockMovementType.SALE,
            quantityDeltaMl: -Math.abs(line.decrementMl),
            quantityInput: line.decrementMl,
            quantityUnit: QuantityUnit.ML,
            referenceId: externalLineId,
            reason: "POS sale",
            createdAt: ticket.soldAt,
            metadata: {
              source: SEED_SOURCE,
              mappingType: "pour",
              externalSaleId,
              externalLineId,
              posItemId: line.posItemId,
              quantity: line.quantity,
            },
          });
        });
      });

      return { sales, lines, movements };
    }

    async function writeTicketRows(rows: TicketRows) {
      await createManyInBatches(rows.sales, (data) => prisma.posSale.createMany({ data }));
      await createManyInBatches(rows.lines, (data) => prisma.posSaleLine.createMany({ data }));
      await createManyInBatches(rows.movements, (data) =>
        prisma.stockMovement.createMany({ data }),
      );
    }

    let ticketIndex = 0;
    let saleCount = 0;
    let lineCount = 0;
    let receiptCount = 0;

    console.log(
      `Writing ${tickets.length} POS sales and ${receiptRows.length} receipts in ${BATCH}-row batches…`,
    );

    for (let offset = 0; offset < calendar.days.length; offset += PROGRESS_EVERY_DAYS) {
      const windowDays = calendar.days.slice(offset, offset + PROGRESS_EVERY_DAYS);
      const from = windowDays[0]!;
      const to = windowDays[windowDays.length - 1]!;

      const receiptsInWindow = receiptRows.filter((r) =>
        inDayWindow(r.createdAt as Date, from, to),
      );
      await createManyInBatches(receiptsInWindow, (data) =>
        prisma.stockMovement.createMany({ data }),
      );

      const ticketsInWindow = tickets.filter((t) => inDayWindow(t.soldAt, from, to));
      const built = rowsForTickets(ticketsInWindow, ticketIndex);
      await writeTicketRows(built);

      ticketIndex += ticketsInWindow.length;
      saleCount += built.sales.length;
      lineCount += built.lines.length;
      receiptCount += receiptsInWindow.length;

      const dayFrom = offset + 1;
      const dayTo = offset + windowDays.length;
      console.log(
        `  Days ${dayFrom}–${dayTo} / ${DAYS} (${from} → ${to}): ${built.sales.length} sales, ${built.lines.length} lines, ${receiptsInWindow.length} receipts`,
      );
    }

    const soldMl = planned.reduce((sum, l) => sum + l.decrementMl, 0);
    console.log("");
    console.log("Seed complete.");
    console.log(`  Tenant:     ${tenant.name} (${tenant.slug})`);
    console.log(`  Created:    ${createdTenant ? "yes (new venue + catalog)" : "no (existing venue)"}`);
    console.log(`  Catalog:    ${products.length} SKUs`);
    console.log(`  Window:     ${calendar.start} → ${calendar.end} (${DAYS} days)`);
    console.log(`  Spikes:     ${calendar.spikes.map((s) => `${s.start} ×${s.mult.toFixed(2)} (${s.days}d)`).join("; ")}`);
    console.log(`  Dry days:   ${calendar.dryDays.join(", ")}`);
    console.log(`  Sales:      ${saleCount} tickets / ${lineCount} lines / ${soldMl.toLocaleString()} ml`);
    console.log(`  Receipts:   ${receiptCount} (source=${SEED_SOURCE})`);
    console.log(`  Admin:      ${adminEmail}`);
    if (createdUser && createdPassword) {
      console.log(`  Password:   ${createdPassword}`);
    } else {
      console.log("  Password:   unchanged (user already existed)");
    }
    console.log("  Login is email-verified and approved.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
