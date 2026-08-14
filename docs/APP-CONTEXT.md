# Bar Inventory — App Context

Living reference for what is built and live. **Update this file whenever changes are pushed to production (Vercel `main`).**

| Field | Value |
|-------|--------|
| Last updated | 2026-05-31 |
| Environment described | Localhost + production parity (Batch 1 complete locally) |
| Production host | Vercel |
| Database (prod) | Neon Postgres |

---

## What this is

**Restaurant Inventory** is a multi-tenant SaaS for bar alcohol inventory. Stock is tracked in **milliliters (ml)**. POS sales (webhook) deduct ml from the right bottles. Admins manage bottles, receive stock, map POS menu items to pour sizes, simulate sales, and see dashboards/alerts.

**Local:** `http://localhost:3000` — `npm run dev:local` or `npm run db:start` + `npm run db:setup` + `npm run dev`.

**Demo login (seed):** `admin@demo.local` / `changeme123`

---

## Tech stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 (App Router), React 19 |
| Language | TypeScript |
| DB | PostgreSQL (Prisma 7 ORM) |
| Auth | Session cookie (jose), bcrypt passwords |
| Email | Resend (verification, password reset) |
| UI | Tailwind 4, CSS variables (dark theme), lucide-react icons |
| Charts | Custom CSS horizontal bar chart (no chart library) |

---

## Tenancy and security

- One **Tenant** = one venue. Users belong to one tenant.
- **Admin** (`/admin/*`) and most **`/api/*`** routes require a signed session.
- **Exceptions:** auth routes, `/api/health`, **`POST /api/webhooks/pos/sale`** (tenant via headers).
- POS webhook auth per tenant:
  - `x-tenant-api-key` — tenant API key (Settings page)
  - `x-pos-signature` — HMAC-SHA256 hex of raw JSON body using `posWebhookSecret`
- Optional dev flag: `DISABLE_AUTH=true` skips auth (banner on admin layout).
- Signup → email verification → onboarding → admin. Forgot/reset password supported.

---

## Core data model (Prisma)

- **Product** — bottle name, SKU, `bottleSizeMl`, `defaultPourMl`. Unique per tenant: `(name, bottleSizeMl)`.
- **ReorderConfig** — `thresholdBottles`, `reorderQuantity` (par / alert threshold).
- **StockMovement** — ledger in ml: `OPENING_BALANCE`, `RECEIVE`, `ADJUSTMENT`, `SALE`. Current stock = sum of `quantityDeltaMl` (sales are negative).
- **PosMenuMapping** — straight pour: `productId`, `posItemId`, `pourMl` (30, 60, or full bottle size).
- **CocktailMapping** — `posItemId`, recipe name, `ingredients` JSON `[{ productId, quantityMl }]`. One sale deducts each ingredient.
- **PosSale** / **PosSaleLine** — recorded sales from webhook or simulator.
- **Alert** — `LOW_STOCK` when stock falls below threshold; **`SLIPPAGE`** when bottle close exceeds tenant tolerance.
- **Vendor** — supplier name + WhatsApp number; optional FK on Product.
- **BottleRotation** — ACTIVE/CLOSED bottle tracking with barcode; slippage on close.
- **StockOrder** — PENDING/PLACED/MODIFIED/CANCELLED auto-created when below threshold.
- **Tenant** — `slippageTolerancePercent`, `shiftSchedule` JSON, shift report timestamps.

---

## Bottle sizes (live)

Allowed in UI/API: **330ml, 650ml, 750ml, 1L (1000), 1.75L (1750), 2L (2000)** — `src/lib/product-naming.ts`. Beer sizes (330ml / 650ml) are full-bottle-only for POS mapping.

---

## Public / auth routes

| Route | Purpose |
|--------|---------|
| `/` | Marketing landing page |
| `/signup`, `/login` | Account creation and sign-in |
| `/forgot-password`, `/reset-password` | Password recovery |
| `/onboarding` | Venue setup after signup |
| `/pending-approval` | Waits for admin approval (`/api/admin/approve` sets `emailVerifiedAt`) |
| `/admin/alerts` | Redirects to `/admin` |

---

## Admin app — sidebar

| Nav | Route |
|-----|--------|
| Dashboard | `/admin` |
| Stock Entry | `/admin/stock` |
| Bottle Handover | `/admin/handover` |
| Stock Orders | `/admin/stock-orders` |
| Bottles | `/admin/products` |
| POS Mappings | `/admin/mappings` |
| POS Simulator | `/admin/pos-sim` |
| Settings | `/admin/settings` |

Dark theme tokens in `src/app/globals.css` (`--background`, `--surface`, `--accent`, etc.).

---

## Feature detail (live)

### Dashboard (`/admin`)

- **Top Selling SKUs by Volume** — horizontal bar chart; `GET /api/inventory/top-selling-skus?period=today|week|month|all` (default: this month). Aggregates `StockMovement` type `SALE` per product (cocktail ingredients credited to ingredient SKUs). **Metric: ml sold.** Period filter refetches without full page reload.
- **KPI cards:** Total SKUs, Total Bottles, Below Threshold.
- **Needs Restocking** — SKUs under par; uses alerts API for “low since” timestamp.
- **Slippage Alerts** — open SLIPPAGE-type alerts from alerts API.
- **All Stock Levels** — sortable (Bottle, Stock, Current ml, Threshold, Status).
- **Latest Orders** — last 5 POS sales, sortable.
- **Stock Activity** — last 5 receive/adjust movements, sortable preview.

### Stock Entry (`/admin/stock`)

- **Receive** — full bottles via `POST /api/inventory/receive`.
- **Adjust — Bottle broken** — 30ml stepper; display names from lookup tables for 750 / 1L / 1.75L / 2L; saves raw ml (`src/lib/bottle-broken-display.ts`).
- **Adjust — Send back to seller** — full bottles removed.
- **Underpour / Overpour** — UI disabled (`ENABLE_POUR_VARIANCE_ADJUSTMENTS = false`).
- Stock levels panel + full activity table (All / Receive / Adjust filters, pagination).

### Bottles (`/admin/products`)

- CRUD for products; auto SKU from name + size; opening stock on create.
- Bottle sizes: 750ml, 1L, 1.75L, 2L.

### POS Mappings (`/admin/mappings`)

- **Straight Pours** — draft rows for 30ml, 60ml, full bottle per product; inline POS ID edit; delete with tombstone slots.
- **Cocktails** — POS item → multi-ingredient recipe; deducts all ingredients on sale.

### POS Simulator (`/admin/pos-sim`)

- Straight Pours / Cocktails tabs; search with auto tab-switch when only one side matches.
- Fire signed webhook; paginated recent sales; multi-line and cocktail sales supported.

### Settings (`/admin/settings`)

- API key, POS webhook secret, venue info.
- **Slippage tolerance** (%), **shift schedule** (7-day end times), **vendors CRUD** with edit and assigned SKUs.

### Bottle Handover (`/admin/handover`)

- Product dropdown + barcode scan (Enter to submit).
- Active rotations table with ml remaining (`bottleSizeMl − POS sales since openedAt`).
- Manual close; slippage alerts section.

### Stock Orders (`/admin/stock-orders`)

- Tabs: All / Pending / Placed / Cancelled; sortable table with checkboxes (read-only on Cancelled tab).
- Inline qty edit; row-level and bulk place/cancel; cancel TXT preview includes PLACED orders only.
- Client-side WhatsApp TXT download (order / modify / cancel).

### Dashboard shift report

- **Generate Shift Report** button (top right) — schedule at shift end or generate now (early confirm).
- Ready banner with CSV download when report is available.
- CSV columns include SKU, storage count, rotation status, and expected physical state.
- Volume fields use **Adjustment tab terminology** (`formatMlForBottleSize`): quarters + ml at partial amounts, **Full bottle (1L)** etc. when ml equals bottle size.
- **POS Orders This Shift** counts sale ml only during bottle rotation intervals that overlapped the shift (active or closed). SKUs with no handover during the shift show **—**.

---

## Key API routes

| Endpoint | Purpose |
|----------|---------|
| `GET/POST /api/products`, `PATCH/DELETE /api/products/[id]` | Bottle CRUD |
| `GET /api/inventory/levels` | Current stock per SKU |
| `POST /api/inventory/receive` | Receive bottles |
| `POST /api/inventory/adjust` | Broken / send-back / pour variance |
| `GET /api/inventory/activity` | Receive + adjustment history |
| `GET /api/inventory/top-selling-skus` | Dashboard chart data |
| `GET/POST/PATCH/DELETE /api/pos-mappings` | Straight pour mappings |
| `GET/POST/PATCH/DELETE /api/cocktail-mappings` | Cocktail mappings |
| `GET /api/pos-sim/sales` | Paginated sale history |
| `GET /api/alerts` | Low-stock + slippage alerts |
| `GET/PATCH /api/settings` | Slippage tolerance, shift schedule |
| `GET/POST /api/vendors`, `PATCH/DELETE /api/vendors/[id]` | Vendor CRUD |
| `GET/POST /api/handover`, `POST /api/handover/[id]/close` | Bottle rotation |
| `GET/POST/PATCH /api/stock-orders` | Stock order list and actions |
| `POST /api/shift-report/schedule`, `GET .../status`, `GET .../download` | Shift report |
| `POST /api/webhooks/pos/sale` | POS sale ingestion |
| `GET /api/auth/me` | Session + tenant keys |

---

## POS sale flow

1. Webhook receives sale JSON (`external_sale_id`, lines with `pos_item_id`, `quantity`, `external_line_id`).
2. Match to straight pour or cocktail mapping.
3. Preflight stock; **409** if insufficient (per-line details).
4. Record sale + negative stock movements.
5. Evaluate low-stock alerts.

---

## Seed data (local)

`prisma/seed.ts`: demo tenant **Demo Venue**, admin user, sample spirits (mostly 750ml), opening balances, POS mappings.

---

## Maintenance

**When pushing to Vercel (`main`):**

1. Update **Last updated** date at the top of this file.
2. Move completed sprint items from **In progress** into **Feature detail (live)**.
3. Add a one-line **Changelog** entry below (newest first).

---

## In progress

See `.cursor/plans/sticky_admin_sidebar_*.plan.md` for any follow-up items.

### Changelog

- **2026-07-26** — Notifications: Notion-style popover anchored to bell (per-row + mark-all read; no auto-read on open).
- **2026-06-09** — Sticky admin sidebar; notifications bell + modal (slippage/low-stock); shift schedule start+end; shift report CSV metadata + stale-window fix; POS mappings auto-draft restore + beer POS-ID-only; POS Sim Recent Sales date filter (Today default); handover info banner + beer SKU filter; nav tab subtext.
- **2026-05-31** — Batch 1 complete locally: beer sizes 330ml/650ml, dashboard slippage alerts, stock orders cancelled tab + row cancel, vendor edit/SKUs in settings, readJsonResponse on admin pages.
- **2026-05-30** — Initial app context doc. Live: dashboard sorting, horizontal top-SKU chart (ml), alerts nav removed, POS sim tabs, bottle-broken lookup, cocktail mappings, webhook multi-line sales.

---

## Repo layout

```
src/app/admin/          Admin pages
src/app/api/            REST API
src/components/admin/   Shared admin UI
src/lib/                inventory, POS, auth, formatting
prisma/schema.prisma    Data model
docs/APP-CONTEXT.md     This file
```

---

## Local commands

```bash
npm run dev:local    # DB + seed + dev server
npm run dev          # app only
npm run dev:clean    # kill stale next, clear .next, dev
npm run build        # production build check
npm run seed         # re-seed
```
