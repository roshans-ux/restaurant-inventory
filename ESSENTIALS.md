# Production essentials

One-time setup for Vercel + Neon. Run through in order.

## 1. Vercel environment variables

In **Project → Settings → Environment Variables** (Production):

| Variable | Required | Notes |
|----------|----------|--------|
| `DATABASE_URL` | Yes | Neon connection string (`?sslmode=require`) |
| `SESSION_SECRET` | Yes | `openssl rand -base64 32` |
| `APP_URL` | Yes | `https://your-project.vercel.app` — **no trailing slash** |
| `RESEND_API_KEY` | Yes | From [resend.com](https://resend.com) |
| `EMAIL_FROM` | Yes | `Bar Inventory <onboarding@resend.dev>` until you have a domain |
| `POS_WEBHOOK_SECRET` | Yes | Your chosen HMAC secret |
| `GOOGLE_SHEETS_WEBHOOK_URL` | Optional | Onboarding rows; skip if not using Sheets yet |

After changing vars → **Redeploy**.

**Node.js:** Settings → General → **20.x**.

## 2. Neon one-time SQL

Grandfather existing users (skip if you only have fresh signups):

```sql
UPDATE "User" SET "emailVerifiedAt" = NOW() WHERE "emailVerifiedAt" IS NULL;
```

Remove junk signups (fake emails):

```sql
DELETE FROM "User" WHERE email = 'admin@gmail.com';
```

## 3. Verify production

Replace `YOUR_URL` with your Vercel host:

| Check | URL |
|-------|-----|
| Health + DB | `YOUR_URL/api/health` |
| Config | `YOUR_URL/api/auth/setup-status` |
| Landing | `YOUR_URL/` |
| Sign up | Use **your Resend account email** for test sender |
| Admin | `YOUR_URL/admin` after verify + onboarding |

`setup-status` shows which env vars are set (not their values).

## 4. Pause Netlify

Avoid double deploys: Netlify site → stop builds or delete site.

## 5. Daily workflow

| Task | Where |
|------|--------|
| Build features | Local: `npm run dev:local` |
| Go live | Push `main` → Vercel auto-deploys (often once/day) |

Resend test sender only delivers to your Resend login email until you verify a domain.

## Beta manual approval

1. Partner signs up (phone required) → onboarding → **Beta Signups** sheet row + alert email to `ADMIN_ALERT_EMAIL` (default `roshan.s@brucira.com`).
2. Click **Approve this account** in the email (or use Neon SQL fallback).
3. Partner signs in at `/login` after approval.

Update Google Apps Script per `docs/google-sheets-apps-script.md` (add **Beta Signups** tab).

## 6. Local `.env` (dev only)

Copy `.env.example` → `.env`. Use same Neon `DATABASE_URL` or local `npm run db:start` URL.

Do **not** set `DISABLE_AUTH` on Vercel.
