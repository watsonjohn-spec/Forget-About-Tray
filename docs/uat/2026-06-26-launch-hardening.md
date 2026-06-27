# 2026-06-26 Launch Hardening UAT

## Scope

Continuation pass for Forget About UAT and launch hardening. This run focused on production freshness, public route smoke checks, static legal/support route blockers, account create-copy acceptance, and safe production config probes.

## Local Verification

- Repository state at start: `main`, `origin/main`, and `origin/gh-pages` pointed at `ddcd0ed8066d6d2f40a0ae046ec74cf65e9e1036`.
- Baseline command before edits: `npm.cmd run check` passed 42/42.
- Final command after edits: `npm.cmd run check` passed 42/42.

## Production Freshness And Health

- `https://forgetabout.im/public-config.js` matched the local public config content.
- `https://forgetabout.im/sitemap.xml` matched the local sitemap before this change.
- `https://watsonjohn-spec.github.io/Forget-About-Tray/public-config.js` matched the local public config content.
- `https://forget-about-tray.onrender.com/public-config.js` matched the local public config content.
- `https://forget-about-tray.onrender.com/api/health` returned `{"status":"ok","service":"forget-about-platform"}`.
- `https://forget-about-tray.onrender.com/api/checkout/config` returned checkout enabled in Stripe test mode with GBP pricing.
- After Render environment was corrected, unauthenticated `POST https://forget-about-tray.onrender.com/api/account/use-free-export` returned `401 Sign in to continue` instead of the previous signing-secret configuration error, confirming the live backend can now see `DOWNLOAD_TOKEN_SECRET`.
- Render deploy commit could not be proven from the public health response because the endpoint does not expose a commit SHA and Render CLI/MCP access was unavailable in this session.

## Browser Route Smoke

Browser path: Codex in-app browser against production. Localhost browser navigation was blocked by connection refusal after the local process exited, so rendered smoke checks used `https://forgetabout.im`.

Routes checked:

- `https://forgetabout.im/tray/`: loaded as `Forget About Tray`, no console errors, tray controls present, base shapes include Square, Rectangle, Circle, and Oval.
- `https://forgetabout.im/print/`: loaded as `Forget About Print`, no console errors, uploaded-print shell present.
- `https://forgetabout.im/factory/`: loaded as `Forget About Print Factory`, no console errors, provider login shell present.
- `https://forgetabout.im/makeup/`: loaded as `Forget About Makeup`, no console errors, beta route notice present.
- `https://forgetabout.im/paint/`: loaded as `Forget About Paint`, no console errors, beta route notice present.
- `https://forgetabout.im/stitch/`: loaded as `Forget About Stitch`, no console errors, beta route notice present.
- `https://forgetabout.im/hub/`: loaded as `Forget About Hub`, no console errors, no launch popup observed, access copy restricts Hub to `watson.john@live.co.uk`.

Screenshot capture through the in-app browser timed out on `Page.captureScreenshot`, so evidence for this run is DOM, URL, title, and console output rather than image files.

## Fixed In This Change

- Create-account dialog label now says `Second name` while preserving the existing `lastName`/`last_name` storage contract.
- Supabase OAuth callbacks now return to the site root first and are relayed back to the stored brand route, avoiding route-specific callback mismatches while preserving the originating app path.
- Added standalone static pages for:
  - `/terms/`
  - `/privacy/`
  - `/cookie/`
  - `/refunds/`
  - `/contact/`
  - `/support/`
- Footer now links directly to those legal/support routes.
- Legal/support routes are excluded from the soft-launch popup so they can be read before payment.
- Sitemap now includes the legal/support routes.

## Production Blockers Still Open

- Live legal/support routes returned 404 before this change and still returned 404 in the follow-up live guard check. They should pass after this change is deployed to GitHub Pages.
- Full signed-in account UAT still needs either explicit approval to create disposable production UAT users/records with the Supabase service key, or a confirmed customer test account. A service-key based production UAT run was blocked by the safety reviewer because it would create confirmed users and persistent records in production.
- Public signup/reset email still needs verification through a working transactional email path. Existing go-live notes say public signup/reset email was blocked by Supabase built-in email quota unless custom SMTP is configured or quota resets.
- Scheduled task secret could not be safely verified with a live POST in this run because the endpoint can mutate production order state if configured. Use Render env inspection or an explicitly approved safe staging/prod probe.
- Render latest deployed commit still needs dashboard, MCP, CLI, or a commit field in `/api/health` to verify directly.
- Payment UAT must be rerun through Worldpay Hosted Payment Pages after the MVP payment-provider change on 2026-06-27; prior Stripe test-mode evidence is no longer sufficient for launch.
- Worldpay live webhook, refunds, manual payout handling, and order durability still need Worldpay/Supabase/Render evidence from authenticated flows.

## Safe Production Config Checks

- Follow-up non-mutating live UAT returned 29 passes and 6 warnings.
- Live public config points at `https://forget-about-tray.onrender.com` and matches the local API base.
- Live route checks passed for `/`, `/tray/`, `/print/`, `/factory/`, `/makeup/`, `/paint/`, `/stitch/`, and `/hub/`.
- Unauthenticated account, factory, and hub API guards returned sign-in errors instead of exposing data.
- `POST /api/account/use-free-export` without auth returned `401 Sign in to continue`, confirming the download signing configuration error is cleared.
- Public bundle scan across `/`, `public-config.js`, `app.js`, `site-wide.js`, `account.js`, `print/print.js`, and `factory/factory.js` found no matches for secret-looking Supabase service keys, Stripe secret/restricted keys, webhook secrets, `TASK_RUNNER_SECRET`, or `DOWNLOAD_TOKEN_SECRET`.
- CORS preflight for `https://forget-about-tray.onrender.com/api/checkout/config` allowed both `https://forgetabout.im` and `https://watsonjohn-spec.github.io`.
- `/trays/` returned a 308 redirect to `/tray/`.

## Inputs Needed

- Confirm `TASK_RUNNER_SECRET` through Render env inspection or approve a live task probe.
- Provide or create a confirmed customer UAT account, or explicitly approve disposable production UAT user/record creation, for login, logout, password reset, save/reload, export, upload, quote, payment, and order-history checks.
- Confirm transactional email/SMTP status.
- Provide Render deployment access or expose deployed commit metadata in `/api/health`.
