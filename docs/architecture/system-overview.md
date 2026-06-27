# System Overview

Forget About is a route-based, multi-brand platform for parametric STL generation, account storage, STL export, and marketplace print fulfilment.

## Core Shape

The platform has three major layers:

- Customer generator apps: route-specific interfaces such as `/tray`, `/makeup`, `/paint`, `/stitch`, and `/print`.
- Shared platform services: auth, account pages, saved designs, STL export, analytics, ads, event logging, checkout, order history, quote generation, and factory handoff.
- Provider and admin operations: `/factory` for printer providers and `/hub` for internal founder/admin control.

## Data And Services

Supabase stores auth-linked profiles, saved designs/projects, print quotes, print jobs, provider profiles, provider capabilities, order records, privacy records, launch signups, and the append-only event log. The MVP payment route uses Worldpay Hosted Payment Pages for customer payment collection and signed payment confirmation. Legacy Stripe code remains as an explicit fallback only when `PAYMENT_PROVIDER=stripe` is deliberately configured.

The Node backend owns privileged operations:

- Payment checkout and webhook handling.
- Supabase service-key writes.
- Factory quote generation.
- Print-job state transitions.
- Provider payout release or manual payout readiness.
- Scheduled delivery chasers and auto-completion.
- Account export and security status.

## Event Spine

Every meaningful user or system action should emit an event to `public.platform_events`. The event log is append-only and is the source for Hub dashboards, future automation, analytics enrichment, and AI decision support. See `docs/EVENT_LOG.md`.

## Brand Isolation

Customer routes should feel like separate apps. A user arriving at `/makeup` should remain in that brand journey unless they deliberately leave the route. The factory/provider resource pool is shared across brands.

## Shared UI And Logic

The shared shell provides account controls, save/export actions, footer/legal copy, analytics, ads, launch hold, and order-management UI. Generator-specific pages should reuse shared services rather than duplicating those flows. During the MVP launch, `/` redirects to `/tray/`, `/print/`, `/makeup/`, `/paint/`, and `/stitch/` remain ringfenced, and customer print quotes are restricted to the launch printer profile attached to `watson.john@live.co.uk`.
