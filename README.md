# Movement Tray Studio

A browser-based prototype for configuring and exporting printable miniature movement trays.

## Features

- Configure rows, columns, base size, spacing, and clearance
- Add a perimeter lip and interval notches
- Live isometric preview and exact dimensions
- Save presets in browser storage
- Export a printable ASCII STL without uploading data
- Paste an army list to get editable per-unit tray recommendations
- Match Beastmen units from the starter base catalogue and remember corrected base sizes locally
- Save and reload complete army tray projects
- Add catalogue or custom units as new visual tray tabs
- Edit army trays in place using the full visual designer
- Route exports through a sponsor-view download or Stripe print-order checkout
- Prototype login gate using `user` / `password`
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
2. Add a Stripe test-mode restricted key beginning with `rk_test_` and grant it **Checkout Sessions: Write** access. A test secret key beginning with `sk_test_` also works.
3. Adjust the pricing and shipping-country environment values.
4. Run `npm start`.

The server calculates the displayed quote and creates Stripe Checkout sessions. Secret keys are never sent to the browser. Live Stripe keys are rejected unless `ALLOW_LIVE_STRIPE=true`.

GitHub Pages cannot securely run this checkout endpoint because it is static hosting. For the public site, deploy `server.mjs` to a Node host and set the `checkout-api-url` meta tag in `index.html` to that backend origin.

Before fulfilling live orders, add a Stripe webhook that verifies `checkout.session.completed`. The return page is only a customer-facing status message and is not proof of payment.

## Verify

```powershell
npm run check
```

## Deploy

The app is fully static. Run `Publish to GitHub.cmd`, then open **Settings → Pages** and select **Deploy from a branch**, `gh-pages`, and `/ (root)`.

The app can also be deployed by copying `index.html`, `styles.css`, and `app.js` to any static host.
