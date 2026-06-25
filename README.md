# Forget About Tray

A browser-based prototype for configuring and exporting printable miniature movement trays.

Forget About Tray is now the first generator in the shared Forget About platform foundation. Brand routing, generator contracts, saved designs, projects, entitlements, orders, and the future cross-brand print factory are separated so additional parametric STL generators can reuse the same platform. See `platform/ARCHITECTURE.md`.

## Features

- Configure rows, columns, base size, spacing, and clearance
- Add a perimeter lip and interval notches
- Rotatable, draggable 3D preview and exact dimensions
- Save tray presets and army projects to a Supabase account
- Download an account-gated printable ASCII STL, or order the tray from the print factory
- Paste an army list to get editable per-unit tray recommendations
- Filter a broad Old World base catalogue by army and remember corrected base sizes locally
- Save and reload complete army tray projects
- Add catalogue or custom units as new visual tray tabs
- Edit army trays in place using the full visual designer
- Route exports through a file-preparation advertising portal or Stripe print-order checkout
- Offer one ad-supported STL download per account, then a one-off GBP 5 unlimited-download unlock
- Supabase user accounts with cloud-saved trays, armies, profiles, and order history
- Server-side Stripe Checkout sessions with test-mode protection
- Customer-selected print providers with colour, rating, UK location, lead time, and all-in price comparison
- A separate rose-gold Forget About Makeup caddy generator at `/makeup/`
- Ordered makeup-product slots, custom dimensions, a centre-spine caddy, a staircase case, and an optional carrying handle

## Run locally

On Windows, double-click `Start Movement Tray.cmd`.

Or run:

```powershell
npm start
```

Then open `http://localhost:4173`.

## Stripe Checkout

1. Copy `.env.example` to `.env`.
2. Add a Stripe test-mode restricted key beginning with `rk_test_` and grant it **Checkout Sessions: Read and Write** access. A test secret key beginning with `sk_test_` also works.
3. Adjust the pricing and shipping-country environment values.
4. Run `npm start`.

The server calculates the displayed quote and creates Stripe Checkout sessions. Secret keys are never sent to the browser. Live Stripe keys are rejected unless `ALLOW_LIVE_STRIPE=true`.

Paid unlimited-download access and the single ad-supported download are recorded against the signed-in Supabase account.
Set `DOWNLOAD_TOKEN_SECRET` to a long random value before deployment so first-download permits cannot be forged.

For Print Factory onboarding, payouts, and provider-decline refunds, the Stripe key must also be allowed to create and read connected accounts, create Express login links, create transfers, and create refunds. Keep the integration in test mode until the complete marketplace flow has been exercised.

Before running the account-enabled app for the first time, open the Supabase SQL Editor and run `supabase/schema.sql`. This creates profiles, saved designs, army lists, entitlements, immutable order snapshots, VAT-ready order fields, and Row Level Security policies.

Re-run `supabase/schema.sql` after pulling the multi-brand platform update. It enables the Makeup brand and generator, migrates existing tray designs and army lists into the generic design/project model, and adds the print marketplace foundation without deleting the legacy records.

The marketplace is designed for UK-only fulfilment initially. Choosing **Have it printed** creates live, time-limited quotes from suitable printer capabilities. Material is costed at GBP 20/kg by default, then the printer's per-print fee, standard postage, 10% Forget About commission, fixed platform fee, and VAT are shown separately. It uses Stripe Connect separate charges and transfers: the printer share remains held until the print job reaches `complete`.

Makeup catalogue dimensions are deliberately marked approximate because cosmetic packaging changes frequently. Customers can add custom products and should measure packaging before ordering a final print.

The shared provider portal is available at `/factory/`. Printers create a dedicated email/password account there, complete their marketplace profile, add materials and colours, and manage assigned jobs. Factory accounts use Supabase Auth, so credentials are not hard-coded into the public site. Printer profiles begin in `pending_review`; approve them administratively before setting them active in the marketplace.

`MARKETPLACE_INCLUDE_PENDING=false` is the safe default, so only approved active providers are selectable. Set it to `true` only when deliberately testing a pending-review provider.

For a confirmed prototype login, double-click `Create Factory Login.cmd`. It uses the private Supabase admin key already stored in `.env`, creates or resets `factory.prototype@forgetabout.im`, and displays a newly generated password locally. Change `FACTORY_PROTOTYPE_EMAIL` in `.env` if you want a different login address.

The factory payout flow uses Stripe Connect Accounts v2 recipient accounts. A printer starts Stripe onboarding from the Payouts page. The platform uses separate charges and transfers, keeps the provider share held through `order_made`, `producing`, and `posted`, and creates the Stripe transfer only after the customer confirms delivery and completes the order. Customers must leave a 1-5 rating before manually confirming receipt. Providers can decline an `order_made` job before production, which refunds the buyer and reverses the held payout record.

Set `PRINT_AUTO_COMPLETE_DAYS` to control the buyer confirmation window for posted jobs. The default is 14 days. Configure a scheduled worker or Render Cron job to call `POST /api/tasks/auto-complete-posted` with `Authorization: Bearer <TASK_RUNNER_SECRET>`. When a posted job is still awaiting buyer confirmation after that window, the task auto-completes it and releases the provider payout if the connected account can receive transfers.

To enable Google and Apple sign-in, open **Supabase Dashboard → Authentication → Providers**, configure Google and Apple, then add the deployed app URL to **Authentication → URL Configuration → Redirect URLs**. Email and password sign-in remains available.

`npm run public-config` generates `public-config.js` using only public browser configuration such as `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, analytics IDs, and optional AdSense publisher/ad-unit IDs. These values are designed to be public and allow account login, analytics, and configured ad portals to work on the deployed site. The Supabase secret key is never included. `Publish to GitHub.cmd` runs this automatically before publishing.

For advertising consent, set up the AdSense **Privacy & messaging** European-regulations message for `forgetabout.im`, then leave `ADSENSE_CONSENT_PROVIDER=google-cmp`. The Google CMP handles AdSense consent where it applies. The local Forget About cookie banner remains analytics-only for GA4 and Microsoft Clarity.

The bundled catalogue covers ranked units across the main and legacy Old World armies. Base dimensions can change with rules updates, so confirm unusual models against the current army publication before printing.

GitHub Pages cannot securely run this checkout endpoint because it is static hosting. For the public site, deploy `server.mjs` to a Node host and set the `checkout-api-url` meta tag in `index.html` to that backend origin.

Before fulfilling live orders, configure the Stripe webhook that verifies `checkout.session.completed`. The return page is only a customer-facing status message and is not proof of payment.

Set the Stripe webhook endpoint to `https://forget-about-tray.onrender.com/api/stripe/webhook`, subscribe to `checkout.session.completed` and `checkout.session.async_payment_succeeded`, and store that exact endpoint's signing secret as `STRIPE_WEBHOOK_SECRET`. The customer return route also verifies a paid print Checkout Session, so a delayed webhook does not leave a paid order hidden from the factory queue.

After this UAT2 update, run `supabase/schema.sql` again. It adds print weight, speed, postage, commission, platform-fee, payout-breakdown, and typed print-job event fields without deleting existing orders.

The account page lets users download their stored data and submit an account-deletion request. Deletion requests require an administrative review because legally required order and VAT records must remain restricted until their retention period expires.

## Verify

```powershell
npm run check
```

## Deploy

The account, order, and payment features require the Node server. Deploy the repository as a Node web service with `npm start`, then add the values from `.env.example` as private host environment variables.

`render.yaml` defines a Render Node web service. Connect the GitHub repository to Render as a Blueprint, then provide the private Stripe and Supabase values requested by Render. The service health check is `/api/health`. The Render-hosted URL serves both the customer app and `/factory/`.

The static GitHub Pages frontend is configured to call `https://forget-about-tray.onrender.com`. The backend accepts calls from the Render service itself and `https://watsonjohn-spec.github.io`.

Start the Render deployment from:

`https://render.com/deploy?repo=https://github.com/watsonjohn-spec/Forget-About-Tray`

On Windows, `Deploy Node Backend.cmd` opens the same deployment flow.

GitHub Pages can display the frontend but cannot run the secure account, Stripe, webhook, or order-record endpoints.
