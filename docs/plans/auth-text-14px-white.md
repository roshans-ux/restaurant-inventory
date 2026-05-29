# Plan: Auth & beta flow text — 14px, fully white

## Requirement

Text in the signup / onboarding / pending-approval flow should be:

- **Font size:** 14px (`text-sm` in Tailwind = 14px, or explicit `font-size: 14px`)
- **Color:** Fully white (`#ffffff` or `color: #fff`) so it is clearly visible on the dark background

Avoid muted secondary tokens (`var(--text-secondary)`, `var(--text-muted)`) for body copy on these screens unless we intentionally keep labels slightly softer.

## Scope (screens to update)

| Screen | File(s) | Current issue |
|--------|---------|----------------|
| Sign up | `src/app/signup/SignupForm.tsx` | Subtitle, beta notice, footer links use `--text-secondary` / `--text-muted` |
| Onboarding | `src/app/onboarding/OnboardingForm.tsx` | Post-signup banner, helper text use muted colors |
| Pending approval | `src/app/pending-approval/page.tsx` | Body copy uses `--text-secondary` / `--text-muted` |
| Login (optional, same shell) | `src/app/login/LoginForm.tsx` | Subtitle / forgot-password area if we want consistency across `AuthPageShell` |

## Implementation approach

1. **Prefer a shared class** on `AuthPageShell` or a small utility e.g. `.auth-body-text` in `globals.css`:
   ```css
   .auth-body-text {
     font-size: 14px;
     line-height: 1.5;
     color: #ffffff;
   }
   ```
2. Apply to paragraphs, beta disclaimer, onboarding banner, pending-approval messages.
3. **Labels** (Email, Phone, etc.): can stay slightly softer (e.g. `#a8a29e`) or also 14px white — confirm with design; requirement emphasizes visible body text.
4. **Links** (Sign in, Forgot password): white or accent (`--accent`) with underline on hover; keep 14px.
5. **Errors** stay red (`var(--red)`).
6. Do **not** change landing page or admin unless requested.

## Verification

- [ ] Sign up: beta disclaimer + “Already have an account?” readable at a glance
- [ ] Onboarding: “You're signed up…” banner fully white, 14px
- [ ] Pending approval: main message white, 14px
- [ ] Mobile 390px — no truncation hiding text
- [ ] Contrast check on `#0e0e11` / `var(--background)` background

## Out of scope

- Global site typography (EB Garamond / Alegreya Sans elsewhere)
- Admin dashboard
- Email templates (HTML in Resend)

## Pending approval bug (from screenshot)

- Phone number glued to "when" — add explicit `{" "}` after `<strong>{user.phone}</strong>`
- Gray/muted body text — switch to 14px `#ffffff`
- Footer: use "sign in" link label instead of raw `/login` path

## Sheet approve on click (planned)

- Approve email link sets **Approved** column to `Yes` via Apps Script webhook (no timestamp changes needed).

## Status

**Implemented** — `.auth-copy` in `globals.css`, all `AuthPageShell` routes, sheet approve-on-click, and Apps Script docs updated.
