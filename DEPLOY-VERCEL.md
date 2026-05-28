# Deploy on Vercel

Use this if Netlify is unavailable or you prefer Vercel. **Keep the same Neon database** — copy env vars from Netlify.

## You do (about 10 minutes)

1. [vercel.com](https://vercel.com) → sign in with GitHub → **Add New → Project** → import `restaurant-inventory`.
2. Before deploy: **Environment Variables** → paste from Netlify:
   - `DATABASE_URL`, `SESSION_SECRET`, `GOOGLE_SHEETS_WEBHOOK_URL`, `POS_WEBHOOK_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`
3. **Deploy** → copy the production URL (e.g. `https://restaurant-inventory-xxx.vercel.app`).
4. Add `APP_URL` = that URL (no trailing slash) → **Redeploy**.
5. In Neon SQL (once, if you have existing users):

```sql
UPDATE "User" SET "emailVerifiedAt" = NOW() WHERE "emailVerifiedAt" IS NULL;
```

6. Test: `/signup`, `/login`, `/admin`. Pause or delete the Netlify site when happy.

Build settings are in `vercel.json` (Prisma `db push` + `next build`, Node 20 in Vercel → Settings → General).

## Optional

- **Custom domain:** Vercel → Domains → add domain → update `APP_URL` → redeploy.
- **Neon pooled URL:** If you see intermittent DB errors, use Neon’s **pooled** connection string for `DATABASE_URL`.
