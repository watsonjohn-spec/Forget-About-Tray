# Forget About Product Board

This board tracks the current development workstreams. GitHub issue links are the external tracking cards; this file keeps the roadmap visible in the codebase.

## In Progress

| Workstream | GitHub card | Current slice |
| --- | --- | --- |
| Print Factory MVP | https://github.com/watsonjohn-spec/Forget-About-Tray/issues/1 | First slice complete: cleaned factory status/payout filters, brand markers, order detail labels, and shared customer order actions. |
| Shared Generator Shell | https://github.com/watsonjohn-spec/Forget-About-Tray/issues/2 | First slice complete: exposed `window.forgetSharedShell` and documented the shared account/order shell rule. |
| Core Customer Journey Hardening | https://github.com/watsonjohn-spec/Forget-About-Tray/issues/3 | Fifth slice complete: factory jobs now flag buyer escalations in the provider queue and job detail alongside the auto-release block. |
| Preview Quality and Visual Trust | https://github.com/watsonjohn-spec/Forget-About-Tray/issues/4 | First slice complete: shared preview renderer now adds drag hints, filament accenting, dimension callouts, and 250mm split-plate guides across generator previews. |
| Productise Generators by Brand | https://github.com/watsonjohn-spec/Forget-About-Tray/issues/5 | Second slice complete: MVP launch mode now publicly exposes Tray, Uploaded Print, and Factory while deferring Makeup, Paint, and Stitch. |
| Storage, Data Retention, GDPR and VAT Records | https://github.com/watsonjohn-spec/Forget-About-Tray/issues/6 | Second slice complete: uploaded STL saves now store the file in private Supabase Storage and keep only storage metadata in the saved design. |
| Monetisation, Entitlements and Abuse Protection | https://github.com/watsonjohn-spec/Forget-About-Tray/issues/7 | First slice complete: account security status now reports active browser/device count, warning-mode versus hard-limit state, and avoids exposing raw device hashes. |

## Next Deepening Slices

| Workstream | GitHub card | Next slice |
| --- | --- | --- |
| Print Factory MVP | https://github.com/watsonjohn-spec/Forget-About-Tray/issues/1 | Add provider-side refund/exception history, richer delivery tracking, and payout reconciliation views. |
| Shared Generator Shell | https://github.com/watsonjohn-spec/Forget-About-Tray/issues/2 | Continue removing generator-local account/export copies once each branded UI has parity. |
| Core Customer Journey Hardening | https://github.com/watsonjohn-spec/Forget-About-Tray/issues/3 | Wire the email outbox to a real provider and add admin-level escalation triage/closure controls. |
| Preview Quality and Visual Trust | https://github.com/watsonjohn-spec/Forget-About-Tray/issues/4 | Add generator-specific visual polish for makeup pegboard/caddy, paint station, stitch tray, and tray storage inserts. |
| Productise Generators by Brand | https://github.com/watsonjohn-spec/Forget-About-Tray/issues/5 | Use registry metadata to generate the landing directory and reduce hardcoded product tile copy. |
| Storage, Data Retention, GDPR and VAT Records | https://github.com/watsonjohn-spec/Forget-About-Tray/issues/6 | Add deletion cleanup for stored STL files, legacy embedded-STL migration, and lifecycle rules for old orphaned uploads. |
| Monetisation, Entitlements and Abuse Protection | https://github.com/watsonjohn-spec/Forget-About-Tray/issues/7 | Add warning-first suspicious-use notices, device revocation, and brand-level entitlement management screens. |

## Things We Need To Do When John Is Back

- Apply the latest `supabase/schema.sql` changes in Supabase, including `launch_signups` and the `tray` brand path moving to `trays`.
- Confirm the live `forgetabout.im` DNS/hosting points at the published GitHub Pages site rather than the old GitHub Pages URL.
- Confirm Render environment values include `CHECKOUT_ALLOWED_ORIGIN=https://forgetabout.im,https://watsonjohn-spec.github.io` and `PUBLIC_API_BASE_URL=https://forget-about-tray.onrender.com`.
- Check Microsoft Clarity and Google Analytics dashboards after traffic has had time to appear, because dashboard session reporting is not instant.
- Confirmed: the launch-hold popup should also show on the Factory provider portal during the pre-launch period.

## Working Assumptions

- The current single repository remains the source of truth for all active brands.
- GitHub issues are enough for now and act as the board cards; this file mirrors the board in code.
- UK-only, GBP, Stripe Checkout, Stripe Connect, and Supabase remain the baseline for the next implementation slices.
- Download STL and print factory remain separate valid fulfilment routes.
- Factory provider payout is still released only after the customer order reaches complete or after expected delivery plus seven daily confirmation chasers have elapsed without buyer confirmation.
- Account-sharing controls start in warning mode before any hard device blocking.
- Launch MVP mode exposes only Tray, Uploaded Print, and Factory in public navigation/sitemap until Makeup, Stitch, and Paint are explicitly promoted.
- Changes should be published after each meaningful, passing implementation bundle rather than after every small edit.
