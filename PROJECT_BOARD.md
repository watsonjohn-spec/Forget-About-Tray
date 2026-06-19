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

## Backlog

| Workstream | GitHub card | Notes |
| --- | --- | --- |
| Storage, Data Retention, GDPR and VAT Records | https://github.com/watsonjohn-spec/Forget-About-Tray/issues/6 | Move file storage beyond JSON design records and keep order/VAT/privacy records clean. |
| Monetisation, Entitlements and Abuse Protection | https://github.com/watsonjohn-spec/Forget-About-Tray/issues/7 | Brand-configurable entitlements, sharing controls, sponsor configuration, and transparent fee breakdowns. |

## Working Assumptions

- The current single repository remains the source of truth for all active brands.
- GitHub issues act as the board cards; this file mirrors the board in code.
- UK-only, GBP, Stripe Checkout, Stripe Connect, and Supabase remain the baseline for the next implementation slices.
- Download STL and print factory remain separate valid fulfilment routes.
- Factory provider payout is still released only after the customer order reaches complete or the scheduled auto-complete rule fires.
- Changes should be published after each meaningful, passing implementation bundle rather than after every small edit.

## Questions For John

- Should GitHub issue cards be enough for now, or do you specifically want a GitHub Projects kanban board layered over them?
- For auto-complete after posting, what default delivery window do you want: 7, 10, or 14 days?
- For account-sharing controls, do you want a hard device limit first, or just suspicious-use warnings until there are real users?
