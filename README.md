## Restaurant Inventory

Multi-tenant alcohol inventory SaaS: POS webhook ingestion, stock movements in ml, low-stock alerts, and a protected admin for bottles, stock entry, mappings, and simulator.

## Run Locally

1. Copy `.env.example` to `.env` and set `SESSION_SECRET` (and optional bootstrap credentials).

2. Start a local database (no Docker required):

```bash
npm run db:start
```

This runs Prisma’s embedded Postgres. Copy the `DATABASE_URL` it prints into `.env` if it differs from the example.

3. Create tables and demo data:

```bash
npm run db:setup
```

Or do everything in one step:

```bash
npm run dev:local
```

4. Start the app (if not using `dev:local`):

```bash
npm run dev
```

Sign in at [http://localhost:3000/login](http://localhost:3000/login) with **`admin@demo.local`** / **`changeme123`**.

**Docker alternative:** `docker compose up -d` and set `DATABASE_URL=postgresql://inventory:inventory@localhost:5432/restaurant_inventory`.

## Authentication & Tenancy

- All `/admin` pages and `/api/*` routes (except auth, health, and POS webhooks) require a signed session cookie.
- Each **tenant** is one venue (customer). Users belong to exactly one tenant.
- On first login to an empty database, the app creates a tenant and owner account using `BOOTSTRAP_ADMIN_*` env vars.
- POS webhooks are authenticated per tenant:
  - `x-tenant-api-key` — tenant API key (shown in **Settings**)
  - `x-pos-signature` — HMAC-SHA256 hex of the raw JSON body using the tenant webhook secret

## Deploy to Netlify

1. Create a hosted Postgres database (Neon/Supabase recommended).
2. Push this repository to GitHub.
3. In Netlify: **Add new site** → **Import from Git** → choose repo.
4. In site settings → **Environment variables**, add:
   - `DATABASE_URL`
   - `SESSION_SECRET`
   - `BOOTSTRAP_ADMIN_EMAIL`
   - `BOOTSTRAP_ADMIN_PASSWORD`
   - `BOOTSTRAP_TENANT_NAME` (optional)
   - `POS_WEBHOOK_SECRET`
5. Deploy. `netlify.toml` runs:

```bash
npx prisma generate && npx prisma db push && npm run build
```

After deploy, sign in at `/login` with your bootstrap credentials, then copy integration keys from **Settings**.
