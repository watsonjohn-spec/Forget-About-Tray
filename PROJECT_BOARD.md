# Forget About Product Board

This board tracks the current development workstreams. GitHub issue links are the external tracking cards; this file keeps the roadmap visible in the codebase.

## In Progress

| Workstream | GitHub card | Current slice |
| --- | --- | --- |
| Print Factory MVP | https://github.com/watsonjohn-spec/Forget-About-Tray/issues/1 | First slice complete: cleaned factory status/payout filters, brand markers, order detail labels, and shared customer order actions. |
| Shared Generator Shell | https://github.com/watsonjohn-spec/Forget-About-Tray/issues/2 | First slice complete: exposed `window.forgetSharedShell` and documented the shared account/order shell rule. |
| Core Customer Journey Hardening | https://github.com/watsonjohn-spec/Forget-About-Tray/issues/3 | First slice complete: lifecycle checks now cover Stripe-confirmed print orders, factory production/posting, customer messaging, customer rating, provider payout release, and provider-decline refunds. |
| Preview Quality and Visual Trust | https://github.com/watsonjohn-spec/Forget-About-Tray/issues/4 | First slice complete: shared preview renderer now adds drag hints, filament accenting, dimension callouts, and 250mm split-plate guides across generator previews. |
| Productise Generators by Brand | https://github.com/watsonjohn-spec/Forget-About-Tray/issues/5 | First slice complete: central registry now carries brand taglines, factory labels, generator capability metadata, default filament metadata, and validation for enabled brand/generator pairs. |
| Storage, Data Retention, GDPR and VAT Records | https://github.com/watsonjohn-spec/Forget-About-Tray/issues/6 | Second slice complete: uploaded STL saves now store the file in private Supabase Storage and keep only storage metadata in the saved design. |
| Monetisation, Entitlements and Abuse Protection | https://github.com/watsonjohn-spec/Forget-About-Tray/issues/7 | First slice complete: account security status now reports active browser/device count, warning-mode versus hard-limit state, and avoids exposing raw device hashes. |

## Next Deepening Slices

| Workstream | GitHub card | Next slice |
| --- | --- | --- |
| Print Factory MVP | https://github.com/watsonjohn-spec/Forget-About-Tray/issues/1 | Add provider-side refund/exception history, richer delivery tracking, and payout reconciliation views. |
| Shared Generator Shell | https://github.com/watsonjohn-spec/Forget-About-Tray/issues/2 | Continue removing generator-local account/export copies once each branded UI has parity. |
| Core Customer Journey Hardening | https://github.com/watsonjohn-spec/Forget-About-Tray/issues/3 | Add expected-delivery calculation, daily buyer confirmation chasers for seven days, escalation warning copy, then scheduled payout release if no confirmation arrives. |
| Preview Quality and Visual Trust | https://github.com/watsonjohn-spec/Forget-About-Tray/issues/4 | Add generator-specific visual polish for makeup pegboard/caddy, paint station, stitch tray, and tray storage inserts. |
| Productise Generators by Brand | https://github.com/watsonjohn-spec/Forget-About-Tray/issues/5 | Use registry metadata to generate the landing directory and reduce hardcoded product tile copy. |
| Storage, Data Retention, GDPR and VAT Records | https://github.com/watsonjohn-spec/Forget-About-Tray/issues/6 | Add deletion cleanup for stored STL files, legacy embedded-STL migration, and lifecycle rules for old orphaned uploads. |
| Monetisation, Entitlements and Abuse Protection | https://github.com/watsonjohn-spec/Forget-About-Tray/issues/7 | Add warning-first suspicious-use notices, device revocation, and brand-level entitlement management screens. |

## Working Assumptions

- The current single repository remains the source of truth for all active brands.
- GitHub issues are enough for now and act as the board cards; this file mirrors the board in code.
- UK-only, GBP, Stripe Checkout, Stripe Connect, and Supabase remain the baseline for the next implementation slices.
- Download STL and print factory remain separate valid fulfilment routes.
- Factory provider payout is still released only after the customer order reaches complete or after expected delivery plus seven daily confirmation chasers have elapsed without buyer confirmation.
- Account-sharing controls start in warning mode before any hard device blocking.
- Changes should be published after each meaningful, passing implementation bundle rather than after every small edit.
