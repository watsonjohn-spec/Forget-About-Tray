# Forget About Repo Manual

This file is the standing training manual for Codex work in this repository. Keep it current when architecture, deployment, security, payment, generator, or documentation rules change.

## What The Platform Is

Forget About is a multi-brand parametric STL generation and print-marketplace platform. Each customer-facing brand has its own route, palette, copy, catalogue, generator options, saved designs, STL export flow, and print-factory handoff, while sharing the same account, order, payment, event, and factory infrastructure.

Current routes:

- `/` is the public holding and launch surface.
- `/tray` is Forget About Tray.
- `/makeup` is Forget About Makeup.
- `/print` is uploaded STL print routing.
- `/paint` is paint storage and station generation.
- `/stitch` is stitch and floss organisation.
- `/factory` is the printer/provider portal.
- `/hub` is the internal founder/admin console.

## Product And Generator Structure

Generators are brand-owned parametric STL producers. The shared platform registry defines brands, routes, generator types, default filament assumptions, factory labels, entitlement scope, and feature capabilities. Generator-specific code should stay in its route or `platform/generators/*` module; shared account, checkout, event, preview, print-estimate, quote, and topbar logic should stay shared.

Each generator should be able to produce:

- A normalized parameter object.
- A preview geometry.
- A printable STL.
- A factory quote payload when physical printing is supported.
- A saved design or saved project record where relevant.

## Shared-Codebase Principle

Build once at platform level when behaviour is common across brands. Do not copy account management, password flows, analytics, ads, checkout, event logging, order history, factory quoting, or print-job lifecycle code into each generator. Brand routes can look visually distinct, but shared behaviour should come from shared modules.

## Non-Negotiable Architecture Rules

- Do not introduce a second auth, order, payment, analytics, or event system.
- Use Supabase for auth and platform persistence unless there is a deliberate architecture decision saying otherwise.
- Use the configured server-side payment provider for payments. The MVP launch provider is Worldpay Hosted Payment Pages; legacy Stripe code is fallback-only unless `PAYMENT_PROVIDER=stripe` is deliberately set. Never expose payment secrets to public JavaScript.
- Keep the event log append-only. Significant actions must emit platform events.
- Keep customer brand journeys route-scoped. Users should not switch brands inside a customer generator app.
- Factory providers are pooled across brands in the platform architecture, but the MVP launch is ringfenced to the launch printer profile attached to `watson.john@live.co.uk`.
- Keep generated STL logic deterministic and testable.
- Keep UI changes consistent with the shared shell unless there is a brand-specific reason to diverge.

## How To Add A New Generator

1. Add or extend the brand/generator entry in the platform registry.
2. Create the route folder and landing/generator UI.
3. Put generator math in a reusable module where practical.
4. Add catalogue data separately from UI code.
5. Wire saved presets/projects through the shared account service.
6. Wire STL export and print factory quoting through the shared export/quote flow.
7. Emit `generator.started`, `generator.completed`, `stl.exported`, and factory/order events where relevant.
8. Add route metadata, sitemap/robots coverage, and analytics coverage.
9. Add tests for registry, preview/STL contract, account shell, and factory handoff.
10. Update docs in `docs/`.

## Testing Expectations

Run `npm.cmd run check` on Windows before handing work back when code changes. Prefer focused tests for narrow changes, and broaden coverage when touching shared account, checkout, event, Supabase, payment providers, generator registry, factory, or routing code.

For browser smoke tests:

- Use Chrome through the Codex Chrome extension for Google/OAuth login, signed-in flows, or anything that depends on existing browser cookies, browser extensions, or the user's real browser profile.
- If the Codex in-app browser hits a Windows sandbox permission error, fall back to Chrome for visual smoke tests unless the user specifically asks to debug the in-app browser itself.

## Deployment Expectations

The static site is published from the repo, and the Node backend is hosted separately. Keep public config generation, GitHub Pages output, Render backend settings, sitemap, robots, and route names aligned. Do not assume a route rename is complete until navigation, redirects, sitemap, analytics, factory handoff, and docs all match.

## Documentation Expectations

Documentation is part of the product. Update docs whenever a task changes architecture, generator behaviour, payment flow, account flow, deployment, privacy/security, or operational workflow.

Documentation and decision updates must include both what changed and why it changed. If the reason is not clear from code, repo docs, commits, or user context, ask or record an explicit follow-up rather than inventing it.

When a task changes standing repo instructions, architecture rules, review expectations, deployment rules, security rules, or agent behaviour, update this `AGENTS.md` file in the same change set.

For regular code review that updates design decisions, use `.agents/decision-review-agent.md` with `docs/playbooks/decision-review-agent.md`. The agent must document what changed and why, may use project conversation evidence when available, and must ask or flag when the rationale is not recoverable from repo evidence. Scheduled ChatGPT runs should run daily when changes exist, are draft-first, and need explicit user approval before any GitHub write action.

Use:

- `docs/architecture/system-overview.md` for the platform shape.
- `docs/features/README.md` for feature inventory.
- `docs/decisions/README.md` for durable decisions.
- `docs/playbooks/README.md` for repeatable operating steps.
- `docs/EVENT_LOG.md` for event contract and subscription rules.

## Security And Payment Safety

- Do not paste or print secrets in chat or logs.
- Keep `.env` secrets local and out of public config.
- Use Supabase publishable keys only in public clients.
- Use Supabase secret/service keys only in server-side code.
- Use Worldpay credentials only in the backend for the MVP payment path.
- Use Stripe restricted or secret keys only in the backend if the legacy Stripe fallback is deliberately enabled.
- Verify webhook signatures before trusting payment-provider events.
- Keep marketplace payouts held until order completion rules are satisfied.
- Store VAT, address, payment, order, refund, and fulfilment records in a GDPR-aware way with deletion/retention boundaries.
- Do not weaken RLS, grants, or append-only event protections to fix a short-term error.

## Rules For Updating Docs After Each Task

Before finishing a task, ask whether the change altered any of these:

- Platform structure.
- Brand/generator routes or capabilities.
- Shared services.
- Event names or payloads.
- Supabase schema, RLS, storage, or Realtime.
- Payment providers, payouts, refunds, or VAT handling.
- Deployment or environment setup.
- Operational playbooks.

If yes, update the relevant file under `docs/` in the same change set, unless the user explicitly asked for code only.
