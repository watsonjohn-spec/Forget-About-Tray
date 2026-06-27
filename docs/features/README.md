# Feature Inventory

Use this file as the top-level index for product capabilities. Keep it high level; create deeper feature files when an area grows enough to need detail.

## Customer Generators

- Tray: movement trays, army-list parsing, storage box inserts, base catalogues, STL export, and print-factory handoff.
- Makeup: caddies, freestanding cases, pegboard cases, product-slot catalogues, STL export, and print-factory handoff.
- Print: uploaded STL preview, saved uploads, print quote routing, and factory handoff.
- Paint: paint boxes and painting station concepts.
- Stitch: thread-slot trays and floss-card generation.

## Account

- Email/password auth.
- Google auth where configured, with provider callbacks relayed from `/` back to the generator route that started sign-in.
- Shared account dropdown across generator routes.
- Profile and address management.
- Password change.
- Order history and order details.
- Account export and deletion request workflow.

## Print Factory

- Printer onboarding.
- Provider capabilities by material, colour, printer bed, price, postage, and lead time.
- Customer quote comparison.
- Paid checkout before queue entry.
- Provider job status updates.
- Customer/provider messaging.
- Decline-and-refund before production.
- Customer delivery confirmation, rating, and payout release.
- Delivery chasers and automatic completion after the confirmation window.

## Hub

- Founder/admin login gate.
- Provider approval controls.
- Founder Console dashboards for operations, growth, finance, capacity, rollout, white-label pipeline, and decision support.

## Platform Services

- Append-only event log.
- Analytics and consent handling.
- AdSense-ready ad portals.
- Sitemap and robots generation.
- Launch holding popup and launch signup capture.
