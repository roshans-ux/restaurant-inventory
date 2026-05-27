import "dotenv/config";
import { StockMovementType, QuantityUnit, UserRole } from "@prisma/client";
import { hashPassword } from "../src/lib/auth/password";
import { getPrismaClient } from "../src/lib/prisma";

const prisma = getPrismaClient();

const SPIRITS = [
  { name: "Grey Goose Vodka", sku: "GG-750", bottleSizeMl: 750, defaultPourMl: 30, openingBottles: 6, threshold: 2, posItems: ["menu_vodka_soda", "menu_vodka_martini"] },
  { name: "Tanqueray Gin", sku: "TQ-750", bottleSizeMl: 750, defaultPourMl: 60, openingBottles: 4, threshold: 1, posItems: ["menu_gin_tonic", "menu_negroni"] },
  { name: "Johnnie Walker Black", sku: "JW-750", bottleSizeMl: 750, defaultPourMl: 60, openingBottles: 5, threshold: 1, posItems: ["menu_scotch_neat", "menu_scotch_soda"] },
  { name: "Patron Silver Tequila", sku: "PT-750", bottleSizeMl: 750, defaultPourMl: 30, openingBottles: 3, threshold: 1, posItems: ["menu_tequila_shot", "menu_margarita"] },
  { name: "Bacardi White Rum", sku: "BC-750", bottleSizeMl: 750, defaultPourMl: 30, openingBottles: 4, threshold: 1, posItems: ["menu_mojito", "menu_rum_soda"] },
  { name: "Campari", sku: "CM-700", bottleSizeMl: 700, defaultPourMl: 30, openingBottles: 2, threshold: 1, posItems: ["menu_negroni_campari", "menu_aperol_spritz"] },
];

async function main() {
  console.log("Seeding database…");

  const tenant = await prisma.tenant.upsert({
    where: { slug: "demo" },
    create: {
      name: "Demo Venue",
      slug: "demo",
      posWebhookSecret: process.env.POS_WEBHOOK_SECRET ?? "dev-secret",
    },
    update: {},
  });

  const seedEmail = process.env.BOOTSTRAP_ADMIN_EMAIL ?? "admin@demo.local";
  const seedPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "changeme123";

  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: seedEmail } },
    create: {
      tenantId: tenant.id,
      email: seedEmail,
      passwordHash: hashPassword(seedPassword),
      name: "Demo Admin",
      role: UserRole.OWNER,
    },
    update: {},
  });

  console.log(`  Venue: ${tenant.name} (${tenant.slug})`);
  console.log(`  Admin: ${seedEmail} / (password from BOOTSTRAP_ADMIN_PASSWORD or changeme123)`);
  console.log(`  Tenant API key: ${tenant.apiKey}`);

  for (const spirit of SPIRITS) {
    const product = await prisma.product.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: spirit.name } },
      create: {
        tenantId: tenant.id,
        name: spirit.name,
        sku: spirit.sku,
        bottleSizeMl: spirit.bottleSizeMl,
        defaultPourMl: spirit.defaultPourMl,
      },
      update: {
        bottleSizeMl: spirit.bottleSizeMl,
        defaultPourMl: spirit.defaultPourMl,
      },
    });

    await prisma.reorderConfig.upsert({
      where: { productId: product.id },
      create: {
        productId: product.id,
        thresholdBottles: spirit.threshold,
        reorderQuantity: 6,
        notifyAdmin: true,
      },
      update: { thresholdBottles: spirit.threshold },
    });

    const existingOpening = await prisma.stockMovement.findFirst({
      where: { productId: product.id, type: StockMovementType.OPENING_BALANCE },
    });

    if (!existingOpening && spirit.openingBottles > 0) {
      await prisma.stockMovement.create({
        data: {
          productId: product.id,
          type: StockMovementType.OPENING_BALANCE,
          quantityDeltaMl: Math.round(spirit.openingBottles * spirit.bottleSizeMl),
          quantityInput: spirit.openingBottles,
          quantityUnit: QuantityUnit.BOTTLE,
          reason: "Seed: initial stock",
        },
      });
    }

    for (const posItemId of spirit.posItems) {
      await prisma.posMenuMapping.upsert({
        where: { tenantId_posItemId: { tenantId: tenant.id, posItemId } },
        create: { tenantId: tenant.id, productId: product.id, posItemId, pourMl: spirit.defaultPourMl },
        update: { productId: product.id, pourMl: spirit.defaultPourMl },
      });
    }

    console.log(`  ✓ ${spirit.name}`);
  }

  console.log("Done.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
