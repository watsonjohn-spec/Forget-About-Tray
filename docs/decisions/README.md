# Architecture Decisions

Record durable product and architecture decisions here. Use short entries with the date, decision, reason, and consequences. Do not bury major decisions only in chat.

## Current Decisions

### One Domain, Route-Based Brands

Customer products live under one domain using routes such as `/tray`, `/makeup`, `/factory`, `/print`, `/paint`, and `/stitch`. Do not use subdomains for these product journeys.

Reason: shared auth, analytics, account state, SEO, and factory routing are simpler under one domain.

### Shared Platform, Distinct Brand Experience

Brands should share infrastructure but keep their visual identity and product copy distinct.

Reason: the platform needs reusable account, payment, event, and factory logic without making each product feel identical.

### Stripe For Payments And Marketplace Payouts

Use Stripe Checkout and Stripe Connect for customer payments, refunds, provider onboarding, and payout control.

Reason: the platform needs to control refunds, commissions, held payouts, and payment status before factory jobs become active.

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

Consequences: Substantive code changes should include a decision-review pass before merge or deployment. Scheduled ChatGPT runs should draft proposed `docs/decisions/README.md` and related-doc updates, show the evidence used, and ask for approval before any GitHub write action. The agent should ask for missing rationale instead of inventing it.

Follow-ups: After the approval workflow is proven, decide whether a write-capable Codex or GitHub workflow should apply approved patches and open pull requests automatically.

## Entry Template

```text
### YYYY-MM-DD Decision Title

Decision:

Reason:

Consequences:

Follow-ups:
```
