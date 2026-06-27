# Forget About Platform Architecture

## Product Model

The platform has four separate concepts:

- A `brand` owns a URL path, customer-facing identity, theme, and entitlement policy.
- A `generator` owns a versioned parameter schema, catalogue type, validation, geometry, STL rendering, and file naming.
- A `design` is one saved set of parameters for one generator.
- A `project` groups designs or source data, such as an army list that produces several movement trays.

Brands and generators are deliberately separate. A brand can expose several generators without duplicating authentication, orders, payments, or factory code.

The active brand is derived from the URL. It is not selected from inside a brand app. The browser sends the active brand and generator with platform API requests, and orders retain both values permanently.

Authentication and checkout return URLs preserve the entry path, so the same brand remains active for the complete customer session and payment journey. OAuth provider sign-in uses `/` as the shared Supabase callback and stores the intended generator route in session storage; the home shell relays the returned auth hash to that route before the generator account code creates the session.

Login surfaces must stay functionally and structurally identical across customer generators and the shared print factory. Email/password sign-in, enabled OAuth providers, account creation, password reset, provider-status messaging, and recovery handling are shared account behavior; only palette, surface name, and logo mark should vary.

## Shared Generator Shell

Customer generators should use the shared shell for account menus, order history, customer/printer messaging, delivery confirmation, rating, save preset, export/print routing, sponsor placement, and footer/legal surfaces wherever practical. Generator-specific code should own only parameter inputs, catalogue interpretation, preview geometry, and STL generation.

The current browser shell is exposed through `window.forgetSharedShell` in `site-wide.js`. New generator pages should prefer this shared path before adding local copies of account or order-management behavior.

## Generator Contract

Each server-side generator module must provide:

```js
{
  type,
  version,
  name,
  catalogueType,
  normalizeParameters(input),
  buildGeometry(parameters),
  renderStl(parameters),
  safeFileName(parameters, name),
  describe(parameters)
}
```

Current implementations:

- `platform/generators/movement-tray.mjs` builds ranked miniature movement trays.
- `platform/generators/makeup-caddy.mjs` builds ordered cosmetic-holder caddies with an optional carry handle.

Generator parameter catalogues are stored separately from saved designs. This allows each generator to have a catalogue similar to the Old World unit catalogue without coupling catalogues to movement trays.

## Shared Customer Journey

```text
Brand URL
  -> branded login
  -> brand generator workspace
  -> save design or project
  -> download STL or enter print factory
  -> select colour and printer quote
  -> Worldpay Hosted Payment Page
  -> track order
```

Accounts are shared across the platform, but each brand app only presents its own designs, projects, entitlements, and orders. There is no in-app brand switcher.

## Print Factory

The printer marketplace is shared by every brand. Printer profiles are not brand-specific.

Customers compare active printer capabilities using:

- Colour and material
- Five-star rating and review count
- Total price, with a drill-down of components
- Lead time
- UK location
- Maximum printable dimensions

The selected quote is snapshotted before checkout. The resulting order and print job retain the originating brand, generator, design parameters, printer, colour, material, price components, and provider share.

Print job states:

```text
pending_payment -> order_made -> producing -> posted -> complete
                       |
                       +-> cancelled/refunded
```

Customer refunds are permitted before `producing`. Entering `producing` locks customer-initiated refunds.

## MVP Payment And Payout Flow

The MVP marketplace uses Worldpay Hosted Payment Pages and manual provider payout release:

1. The customer pays the Forget About platform through a Worldpay Hosted Payment Page.
2. A signed Worldpay payment event confirms the order before the print job enters the factory queue.
3. The platform records the provider share as a held transfer.
4. No payout is marked ready while the job is `order_made`, `producing`, or `posted`.
5. When the job reaches `complete`, the held transfer becomes ready for manual payout.
6. Payout state is recorded in `provider_transfers`.

Legacy Stripe Checkout and Stripe Connect code remains fallback-only when `PAYMENT_PROVIDER=stripe` is deliberately configured. It is not the MVP launch path.

This delayed payout rule must be enforced server-side. Browser requests must never be allowed to create payouts or directly set a job to `complete`.

## Legacy Stripe Connect Funds Flow

The legacy Stripe fallback uses separate charges and transfers:

1. The customer pays the Forget About platform through Stripe Checkout.
2. The platform records the provider share as a held transfer.
3. No transfer is created for the printer while the job is `order_made`, `producing`, or `posted`.
4. When the job reaches `complete`, the held transfer becomes ready and the server creates a Stripe transfer to the printer's connected account.
5. Transfer identifiers and state are recorded in `provider_transfers`.

If this fallback is used again, new connected accounts should use Stripe Accounts v2. Public printer profiles and private connected-account records are stored separately.

## Credential Sharing Controls

Paid entitlement checks and STL generation happen on the server. A shared password alone must not bypass them.

The platform schema includes `account_devices` for active-device controls. Before enabling enforcement:

- Register a hashed device identifier for authenticated server requests.
- Limit concurrently active devices per account.
- Let users revoke devices from their account.
- Require recent authentication for device replacement and sensitive account changes.
- Rate-limit downloads and flag unusual device, IP, and volume patterns for review.

This reduces casual credential sharing without treating normal device changes as fraud. Device enforcement should be activated only after the account UI can show and revoke devices.

## Data Ownership

- Supabase Auth owns identities and login providers.
- `profiles` owns shared customer details.
- `designs`, `projects`, and generator catalogue tables own generator data.
- `orders` and immutable customer snapshots own accounting and VAT records.
- `printer_profiles` and `printer_capabilities` own public marketplace data.
- `printer_payment_accounts` owns private legacy payout-account state.
- `print_quotes`, `print_jobs`, and `print_job_events` own fulfilment.
- `provider_transfers` owns delayed printer payout state.

Row Level Security allows customers and printers to view only their relevant private records. Financial state changes remain service-role operations.

## Deployment Shape

All customer brands can run from one codebase and one backend while using separate path-based entry points:

```text
forgetabout.im/tray
forgetabout.im/makeup
forgetabout.im/crosstitch
forgetabout.im/board-games
```

The print factory is a separate shared application surface backed by the same platform database and API. Structural changes belong in shared platform modules; generator-specific behavior belongs in generator modules.
