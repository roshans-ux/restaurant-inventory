# Release 2 report (`forecasting`)

Not merged to `main`. Production was not touched.

## What was already done

- `main` (Release 1) was merged into `forecasting` (`7cf0f47`): BarTally naming, `/contact` + `/privacy`, `WHATSAPP_APPROVAL_REQUIRED` env, `prisma db push` without `--accept-data-loss`, Singapore (`sin1`).
- Meta WhatsApp, sales import, forecasts, restock check, and Hobby-safe crons were already on this branch.
- `Tenant.whatsappOrderApproval` (`Boolean @default(false)`) and an in-app approval checkbox already existed (`b5c4e45`).
- WhatsApp send/cron/webhook paths already skipped when Cloud API env vars were missing.

## What this pass added (spec finish)

Compared uncommitted work to the spec, then finished the gaps:

| Spec | Status |
|------|--------|
| Toggle **Send WhatsApp updates** (default off) for morning digest + weekly slippage | Done. New `Tenant.whatsappUpdates Boolean @default(false)`. |
| Toggle **Approve orders on WhatsApp** (default off), only when updates is on | Done. Hidden unless updates is on; turning updates off also turns approval off. |
| Both toggles disabled until an Admin WhatsApp number is **saved** | Done. |
| Turning updates on sends a **WhatsApp connected** test and shows delivered / not delivered | Done (`POST /api/settings/whatsapp/test` template `connected`). |
| Master **`WHATSAPP_ENABLED`** (still accepts `WHATSAPP_APPROVAL_REQUIRED`) | Done in `src/lib/whatsapp/enabled.ts`. Unset or false → no WhatsApp for any venue; Place still emails vendors. |
| Existing venues start with both toggles off | Confirmed on `ep-spring-frog` (Chin Lung, Roshan da Dhaba, Demo Venue, all others). |
| Skip cleanly with **WhatsApp not configured** when `WHATSAPP_*` unset | Done for crons, digest, slippage, Send test, Meta webhook GET/POST, Twilio webhook. |

Also: `npm run build` now uses `next build --webpack` so this Mac (WASM-only Next bindings) can compile; Vercel Preview uses the same script.

Owner WhatsApp hold requires **all** of: `WHATSAPP_ENABLED`, venue updates on, venue approval on, Cloud API configured, saved admin number.

## Build

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | Pass |
| `npm run build` (`next build --webpack`) | Pass (exit 0) |
| First `next build` without `--webpack` | Failed on this machine (Turbopack needs native SWC). Fixed via webpack flag. |

## Tests (dev DB `ep-spring-frog` only)

`DATABASE_URL` confirmed to contain `ep-spring-frog`. WhatsApp env vars emptied for the local Next process. **No Production database.**

| Test | Result |
|------|--------|
| All venues `whatsappUpdates` / `whatsappOrderApproval` | Both **false** |
| `GET /api/settings` (Demo Venue) | `whatsappUpdates: false`, `whatsappOrderApproval: false`, `whatsappEnabled: false` |
| `GET /admin/settings` | HTTP **200** |
| Place stock order (Demo Venue; admin WhatsApp **is** saved) | **PLACED** immediately; log: “WhatsApp not configured. Vendor email sent directly.” Then cancelled. |
| Cron `/api/cron/order-batch` | `skipped: "WhatsApp not configured"` |
| Cron `/api/cron/weekly-slippage` | same skip |
| Webhook GET | `503` `{ error: "WhatsApp not configured" }` |
| Webhook POST | `200` `{ error: "WhatsApp not configured" }` |
| Send test | `400` `WHATSAPP_NOT_CONFIGURED` |

Local `.env` has no `RESEND_API_KEY`, so vendor email is logged rather than sent via Resend. The Place path is the same as Production.

## Schema vs `main` (Production)

Every difference is **additive** (new tables, new nullable columns, or columns with defaults). No renames, drops, or type changes.

| Change | Additive? |
|--------|-----------|
| `Tenant.whatsappUpdates Boolean @default(false)` | Yes |
| `Tenant.whatsappOrderApproval Boolean @default(false)` | Yes |
| `Tenant.forecastCoverageDays Int @default(7)` | Yes |
| `Tenant.forecastSafetyDays Int @default(1)` | Yes |
| `Tenant.salesImportColumnMapping Json?` | Yes |
| `Tenant.salesImportIgnoredNames Json?` | Yes |
| `Vendor.leadTimeDays Int @default(2)` | Yes |
| `StockOrder.approvalBatchId String?` | Yes |
| `PosSale.source String @default("POS")` | Yes |
| `PosSale.importBatchId String?` | Yes |
| `PosSale.billNumber String?` | Yes |
| Table `SalesImportBatch` | Yes |
| Table `WhatsAppMessageLog` | Yes |
| Table `WhatsAppVenueSession` | Yes |

Production build command is `npx prisma db push && npm run build` (**no** `--accept-data-loss`). The `prisma/migrations` folder is not applied unless someone runs `migrate deploy`.

## Crons (Vercel schedules are UTC)

| Path | UTC | IST | Hobby | Route exists |
|------|-----|-----|-------|----------------|
| `/api/cron/order-batch` | `0 3 * * *` | **8:30 AM daily** | Yes | Yes |
| `/api/cron/restock-check` | `30 3 * * *` | **9:00 AM daily** | Yes | Yes (also sends morning digest when WhatsApp is on) |
| `/api/cron/weekly-slippage` | `30 4 * * 1` | **Monday 10:00 AM** | Yes (weekly) | Yes |

## Deploy

- Branch: `forecasting` @ `f7c888b` (not merged to `main`)
- Preview: **Ready** — https://forecasting.bartally.in (build ~1m 32s, functions `sin1`)
- Production / `main`: unchanged
