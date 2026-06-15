# Forget About Tray

A browser-based prototype for configuring and exporting printable miniature movement trays.

Forget About Tray is now the first generator in the shared Forget About platform foundation. Brand routing, generator contracts, saved designs, projects, entitlements, orders, and the future cross-brand print factory are separated so additional parametric STL generators can reuse the same platform. See `platform/ARCHITECTURE.md`.

## Features

- Configure rows, columns, base size, spacing, and clearance
- Add a perimeter lip and interval notches
- Live isometric preview and exact dimensions
- Save tray presets and army projects to a Supabase account
- Download an account-gated printable ASCII STL, or order the tray from the print service
- Paste an army list to get editable per-unit tray recommendations
- Filter a broad Old World base catalogue by army and remember corrected base sizes locally
- Save and reload complete army tray projects
- Add catalogue or custom units as new visual tray tabs
- Edit army trays in place using the full visual designer
- Route exports through a sponsor-view download or Stripe print-order checkout
- Offer one sponsored STL download per account, then a one-off GBP 5 unlimited-download unlock
- Supabase user accounts with cloud-saved trays, armies, profiles, and order history
- Server-side Stripe Checkout sessions with test-mode protection

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

Paid unlimited-download access and the single sponsored download are recorded against the signed-in Supabase account.
Set `DOWNLOAD_TOKEN_SECRET` to a long random value before deployment so sponsored-download permits cannot be forged.

Before running the account-enabled app for the first time, open the Supabase SQL Editor and run `supabase/schema.sql`. This creates profiles, saved designs, army lists, entitlements, immutable order snapshots, VAT-ready order fields, and Row Level Security policies.

Re-run `supabase/schema.sql` after pulling the multi-brand platform update. It migrates existing tray designs and army lists into the generic design/project model and adds the print marketplace foundation without deleting the legacy records.

The marketplace is designed for UK-only fulfilment initially. It uses customer-selected printers and Stripe Connect separate charges and transfers: the printer share remains held until the print job reaches `complete`.

The shared provider portal is available at `/factory/`. Printers create a dedicated email/password account there, complete their marketplace profile, add materials and colours, and manage assigned jobs. Factory accounts use Supabase Auth, so credentials are not hard-coded into the public site. Printer profiles begin in `pending_review`; approve them administratively before setting them active in the marketplace.

For a confirmed prototype login, double-click `Create Factory Login.cmd`. It uses the private Supabase admin key already stored in `.env`, creates or resets `factory.prototype@forgetabout.im`, and displays a newly generated password locally. Change `FACTORY_PROTOTYPE_EMAIL` in `.env` if you want a different login address.

The factory payout flow uses Stripe Connect Accounts v2 recipient accounts. A printer starts Stripe onboarding from the Payouts page. The platform uses separate charges and transfers, keeps the provider share held through `order_made`, `producing`, and `posted`, and creates the Stripe transfer only after the customer confirms delivery and completes the order.

To enable Google and Apple sign-in, open **Supabase Dashboard → Authentication → Providers**, configure Google and Apple, then add the deployed app URL to **Authentication → URL Configuration → Redirect URLs**. Email and password sign-in remains available.

`npm run public-config` generates `public-config.js` using only `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`. These values are designed to be public and allow account login to work on GitHub Pages. The Supabase secret key is never included. `Publish to GitHub.cmd` runs this automatically before publishing.

The bundled catalogue covers ranked units across the main and legacy Old World armies. Base dimensions can change with rules updates, so confirm unusual models against the current army publication before printing.

GitHub Pages cannot securely run this checkout endpoint because it is static hosting. For the public site, deploy `server.mjs` to a Node host and set the `checkout-api-url` meta tag in `index.html` to that backend origin.

Before fulfilling live orders, configure the Stripe webhook that verifies `checkout.session.completed`. The return page is only a customer-facing status message and is not proof of payment.

Set the Stripe webhook endpoint to `/api/stripe/webhook`, subscribe to `checkout.session.completed` and `checkout.session.async_payment_succeeded`, and store its signing secret as `STRIPE_WEBHOOK_SECRET`.

The account page lets users download their stored data and submit an account-deletion request. Deletion requests require an administrative review because legally required order and VAT records must remain restricted until their retention period expires.

## Verify

```powershell
npm run check
```

## Deploy

The account, order, and payment features require the Node server. Deploy the repository as a Node web service with `npm start`, then add the values from `.env.example` as private host environment variables.

`render.yaml` defines a Render Node web service. Connect the GitHub repository to Render as a Blueprint, then provide the private Stripe and Supabase values requested by Render. The service health check is `/api/health`. The Render-hosted URL serves both the customer app and `/factory/`.

Start the Render deployment from:

`https://render.com/deploy?repo=https://github.com/watsonjohn-spec/Forget-About-Tray`

GitHub Pages can display the frontend but cannot run the secure account, Stripe, webhook, or order-record endpoints.
