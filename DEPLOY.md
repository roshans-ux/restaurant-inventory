# Deploy to Netlify (step-by-step, no jargon)

> **Vercel instead?** See [DEPLOY-VERCEL.md](./DEPLOY-VERCEL.md) — repo includes `vercel.json`; you only connect GitHub and paste env vars in the Vercel UI.

You need **3 free accounts** (about 20 minutes total):

1. **GitHub** — stores your code  
2. **Neon** — hosts your database (Postgres)  
3. **Netlify** — hosts your website  

---

## Part A — Put code on GitHub

### A1. Create a GitHub account (skip if you have one)

Go to [https://github.com/signup](https://github.com/signup) and sign up.

### A2. Create an empty repository

1. Go to [https://github.com/new](https://github.com/new)  
2. **Repository name:** `restaurant-inventory`  
3. Leave it **Public** (simplest for free Netlify)  
4. **Do not** check “Add a README”  
5. Click **Create repository**  

GitHub shows a page with setup commands. **Keep that tab open.**

### A3. Push your project from the Mac Terminal

Open **Terminal**, paste these lines **one at a time** (replace `YOUR_GITHUB_USERNAME` with your real GitHub username):

```bash
cd /Users/Work/restaurant-inventory

git add .
git commit -m "Initial commit — bar inventory app"

git branch -M main
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/restaurant-inventory.git
git push -u origin main
```

- If it asks you to log in, use a **GitHub Personal Access Token** as the password (GitHub → Settings → Developer settings → Personal access tokens).  
- If `remote origin already exists`, run:  
  `git remote set-url origin https://github.com/YOUR_GITHUB_USERNAME/restaurant-inventory.git`  
  then `git push -u origin main` again.

Refresh your GitHub repo page — you should see all the project files.

---

## Part B — Create the online database (Neon)

### B1. Sign up

Go to [https://neon.tech](https://neon.tech) → **Sign up** (Google login is fine).

### B2. Create a project

1. Click **New Project**  
2. Name: `bar-inventory`  
3. Region: pick one close to you  
4. Click **Create**  

### B3. Copy the database URL

1. On the project dashboard, find **Connection string**  
2. Choose **Prisma** (or “URI”) if there’s a dropdown  
3. Click **Copy** — it looks like:  
   `postgresql://neondb_owner:xxxxx@ep-xxxx.us-east-2.aws.neon.tech/neondb?sslmode=require`  
4. Save it in Notes — this is your **`DATABASE_URL`**

### B4. Create tables (run once on your Mac)

In Terminal:

```bash
cd /Users/Work/restaurant-inventory

DATABASE_URL="PASTE_YOUR_NEON_URL_HERE" npx prisma db push
```

(Optional demo bottles + login user:)

```bash
DATABASE_URL="PASTE_YOUR_NEON_URL_HERE" npm run seed
```

If you skip seed, you’ll create the admin on first login (Part D).

---

## Part C — Deploy on Netlify

### C1. Sign up and import the repo

1. Go to [https://app.netlify.com/signup](https://app.netlify.com/signup)  
2. Sign up with **GitHub** (same account as Part A)  
3. Click **Add new site** → **Import an existing project**  
4. Choose **GitHub** → authorize Netlify → select **`restaurant-inventory`**  
5. Netlify should show:  
   - **Build command:** `npx prisma generate && npx prisma db push && npm run build`  
   - (from `netlify.toml` — don’t change unless Netlify asks)  
6. **Do not click Deploy yet** — add environment variables first (next step).

### C2. Add environment variables

Before deploying, open **Site configuration** → **Environment variables** → **Add a variable** → **Add single variable**.

Add each of these (use real values):

| Key | Value |
|-----|--------|
| `DATABASE_URL` | Your Neon URL from Part B |
| `SESSION_SECRET` | Any long random string, e.g. open Terminal and run: `openssl rand -base64 32` |
| `GOOGLE_SHEETS_WEBHOOK_URL` | Your Google Apps Script web app URL (ends with `/exec`) — for signup onboarding rows |
| `POS_WEBHOOK_SECRET` | Any secret string, e.g. `my-live-webhook-secret-2026` |
| `RESEND_API_KEY` | API key from [resend.com](https://resend.com) — signup verification + password reset emails |
| `EMAIL_FROM` | Verified sender, e.g. `Bar Inventory <noreply@yourdomain.com>` |
| `APP_URL` | Your live site URL, e.g. `https://restaurant-inventory-mgmt.netlify.app` (no trailing slash) |

Apply to **Production** (and **Deploy previews** if offered).

### C3. Deploy

Click **Deploy site** (or **Trigger deploy**).

Wait 3–5 minutes. When the status is **Published**, click the site URL (e.g. `https://random-name-123.netlify.app`).

---

## Part D — First account on the live site

1. Open `https://YOUR-SITE.netlify.app/signup`  
2. Enter your email, password, and confirm password → **Sign up**  
3. Complete onboarding: restaurant name, location, how you heard about us → **Continue to dashboard**  
4. Check your Google Sheet — a new row should appear  
5. Go to **Settings** for your live webhook URL and API key  

**Already have an account?** Use `/login` instead.

If you ran seed against Neon: sign in at `/login` with `admin@demo.local` / `changeme123` (skips onboarding).

**Existing accounts before email verification:** After the first deploy with this feature, run once in Neon SQL:

```sql
UPDATE "User" SET "emailVerifiedAt" = NOW() WHERE "emailVerifiedAt" IS NULL;
```

That keeps current restaurants able to log in without re-verifying.

### Check setup (optional)

`https://YOUR-SITE.netlify.app/api/auth/setup-status` — shows `userCount` and whether sign up is enabled.

---

## If something breaks

| Problem | Fix |
|--------|-----|
| Build fails on `prisma db push` | Check `DATABASE_URL` in Netlify env vars; Neon project must be running |
| Blank page | Open `/login` directly |
| “Database is not running” on Netlify | Wrong or missing `DATABASE_URL` — must be Neon URL, not localhost |
| “Email already exists” on sign up | Use **Sign in** or a different email |
| Onboarding saved but no Google Sheet row | Check `GOOGLE_SHEETS_WEBHOOK_URL` in Netlify and redeploy |
| Stuck on onboarding after completing it | Sign out and sign in again; clear cookies |

### Google Sheet for signups

1. Create a sheet with headers: Email, Restaurant name, Location, How did you hear about us, Signed up at  
2. Deploy a Google Apps Script web app (`doPost`) that appends rows  
3. Paste the **Web app URL** into Netlify as `GOOGLE_SHEETS_WEBHOOK_URL`  
4. Redeploy after adding the variable  

**Local dev:** add the same URL to your `.env` file (never commit it to GitHub).

---

## Later: change the site name

Netlify → **Domain management** → add a custom domain or change the `*.netlify.app` subdomain.
