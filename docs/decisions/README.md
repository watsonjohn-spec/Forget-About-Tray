# Architecture Decisions

Record durable product and architecture decisions here. Use short entries with the date, decision, reason, and consequences. Do not bury major decisions only in chat.

## Current Decisions

### One Domain, Route-Based Brands

Customer products live under one domain using routes such as `/tray`, `/makeup`, `/factory`, `/print`, `/paint`, and `/stitch`. Do not use subdomains for these product journeys.

Reason: shared auth, analytics, account state, SEO, and factory routing are simpler under one domain.

### Shared Platform, Distinct Brand Experience

Brands should share infrastructure but keep their visual identity and product copy distinct.

Reason: the platform needs reusable account, payment, event, and factory logic without making each product feel identical.

### Worldpay For MVP Customer Payments

Use Worldpay Hosted Payment Pages for MVP customer payment routing. Keep payment creation and webhook confirmation server-side, and keep legacy Stripe code fallback-only behind `PAYMENT_PROVIDER=stripe`.

Reason: Stripe does not operate for the launch business location, while the platform still needs a hosted payment page, server-side secrets, and signed payment confirmation before orders enter the factory queue.

Consequences: Printed-order checkout now requires a saved customer delivery address before payment, because Worldpay HPP is not being used as the source of fulfilment address data. Provider payouts move to a manual-ready state after customer completion until a Worldpay payout/refund automation path is selected and tested.

Follow-ups: Configure live Worldpay credentials and webhook signing in the backend environment, run a paid Worldpay UAT order, and decide whether refunds/payouts are handled manually for launch or automated through a Worldpay API integration.

### Supabase As The Operational Data Store

Use Supabase Auth, Postgres, Storage, RLS, and Realtime for the current platform backend.

Reason: it is fast to build with, supports auth-linked records, and is enough for the current operating model.

### Append-Only Event Log

Every significant action should emit an immutable event to `public.platform_events`.

Reason: dashboards, automations, analytics, AI agents, and integrations become easier when the platform has a single event spine.

### UK-First Factory Rollout

Initial factory/provider operations are UK-only.

Reason: VAT, delivery, currency, provider matching, and support are simpler while the workflow is still being proven.

### 2026-06-26 Decision Review Agent

Decision: Maintain a dedicated decision review agent and playbook that can run as a scheduled ChatGPT agent, review project conversations and GitHub repo evidence, then draft GitHub-tracked design decision documentation updates with what changed, why it changed, consequences, and follow-ups.

Reason: The platform now spans multiple brands, shared services, Supabase, Stripe, events, factory operations, and deployment paths. Durable decisions need to outlive chat sessions and individual pull request summaries, but repo writes still need an approval boundary.

Consequences: Substantive code changes should include a decision-review pass before merge or deployment. Scheduled ChatGPT runs should run daily when changes exist, draft proposed `docs/decisions/README.md` and related-doc updates, show the evidence used, and ask for approval before any GitHub write action. The agent should ask for missing rationale instead of inventing it.

Follow-ups: After the approval workflow is proven, decide whether a write-capable Codex or GitHub workflow should apply approved patches and open pull requests automatically.

### 2026-06-26 Launch Hardening Routes And OAuth Callback Relay

Decision: Add standalone public policy and support routes for `/terms/`, `/privacy/`, `/cookie/`, `/refunds/`, `/contact/`, and `/support/`, link them from the shared footer, include them in the sitemap, and use `/` as the shared Supabase OAuth callback before relaying users back to the generator route that started sign-in.

Reason: Launch users need legal, privacy, refund, contact, and support information available before payment or account use, and route-specific OAuth callbacks can mismatch provider configuration as more brand routes are added. A shared root callback keeps Supabase provider setup simpler while preserving the customer's route-scoped journey.

Consequences: Static policy/support pages become part of the public launch surface and must stay aligned with payment, privacy, refunds, and support operations. OAuth sign-in depends on session storage to remember the intended return route, so private or embedded browsers without session storage may fall back to the root journey.

Follow-ups: Deploy the routes to GitHub Pages, verify the live `/terms/`, `/privacy/`, `/cookie/`, `/refunds/`, `/contact/`, and `/support/` URLs no longer return 404, and replace draft policy copy with reviewed legal wording before full launch.

### 2026-06-27 MVP Tray-Only Public Launch

Decision: Use `/` as a redirect/fallback into `/tray/`, keep Factory available for the launch printer, and remove `/print/`, `/makeup/`, `/paint/`, and `/stitch/` from the MVP public launch config and sitemap without deleting their generators.

Reason: The launch should be focused on Forget About Tray while preserving the broader platform code for later routes.

Consequences: Deferred routes remain accessible to someone with the direct URL but show the private-beta banner and are not linked from the launch surface or sitemap. Customer print quotes are restricted to the printer profile attached to `watson.john@live.co.uk`.

Follow-ups: Re-open public config and sitemap entries when each additional generator is ready for launch.

## Entry Template

```text
### YYYY-MM-DD Decision Title

Decision:

Reason:

Consequences:

Follow-ups:
```
