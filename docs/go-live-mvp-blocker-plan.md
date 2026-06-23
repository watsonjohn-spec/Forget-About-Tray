# Forget About — Go-Live MVP Blocker Execution Plan

## Objective
Move the MVP from test to live safely. Do not widen scope. Prioritise launch reliability over polish.

Primary launch blocker:

> A stranger can complete login → generate/upload → save → download/print → pay → order visible → fulfilment/completion without manual intervention.

## MVP Launch Scope
Public launch scope should be limited to:

1. Tray generator
2. Uploaded Print route
3. Account/order history
4. Payment/entitlement flow
5. Minimum viable print-factory/provider route only if it is safe enough

Makeup, Stitch and Paint should be hidden, beta-gated, or explicitly deferred unless already safe.

## Critical Blockers

### Scope and Auth
- [ ] BLK-001 Freeze MVP to Tray + Uploaded Print only for launch.
- [ ] BLK-002 User registration, login, logout and password reset work end-to-end.

### Customer Journey
- [ ] BLK-003 Complete Tray route works: login → create tray → save design → reload design → export STL → account/order history visible where applicable.
- [ ] BLK-004 Complete Uploaded Print route works: login → upload STL → save/request print → choose provider/test provider → pay → order visible.
- [ ] BLK-010 Customer account order drill-down works.

### Payments
- [ ] BLK-005 Stripe live mode configured safely, with live keys only in production env vars.
- [ ] BLK-006 Stripe live webhook configured and tested.
- [ ] BLK-007 Successful payment creates a durable order.
- [ ] BLK-008 Failed payment does not create a fulfilled/paid order.
- [ ] BLK-009 Refund flow updates customer/order state and preserves audit trail.

### Print Factory
- [ ] BLK-011 Provider queue/detail works for MVP.
- [ ] BLK-012 Provider status updates sync to customer account.
- [ ] BLK-013 Provider decline job/refund/reroute path is implemented, or public marketplace route is disabled until safe.

### Storage and Data
- [ ] BLK-014 Generated and uploaded STL storage is durable across refresh/redeploy.
- [ ] BLK-015 Design records are separate from order records.
- [ ] BLK-020 Purchase data retained in accounting-friendly shape: date, customer, product, amount, VAT/tax basis, Stripe ref, refund ref.

### Security
- [ ] BLK-016 RLS enabled for all private user/order/provider/file tables.
- [ ] BLK-017 Private files protected from cross-user access.
- [ ] BLK-018 Service-role key and other secrets not exposed in client bundle, logs or browser network responses.
- [ ] BLK-023 Paid STL/download route protected; no payment bypass.
- [ ] BLK-024 Basic duplicate checkout/submission protection.

### Preview Trust
- [ ] BLK-021 Tray preview is not materially misleading versus generated STL.
- [ ] BLK-022 Oversized model handling is clear before payment.

### Operational Go-Live
- [ ] BLK-025 Transactional emails work.
- [ ] BLK-026 Production domain and HTTPS work for forgetabout.im and www.
- [ ] BLK-027 Legal pages published and linked: Terms, Privacy, Cookie, Refund/Cancellation, Contact.
- [ ] BLK-028 Support route operational.
- [ ] BLK-029 Production error visibility exists.
- [ ] BLK-030 Backup and restore tested.
- [ ] BLK-031 Production env vars documented.
- [ ] BLK-032 Rollback path tested.
- [ ] BLK-034 Friendly-user soft launch completed.

## Non-Blocking / Defer Unless Easy
- [ ] BLK-019 GDPR delete/export can be manual for MVP if documented.
- [ ] BLK-033 Minimum analytics can be deferred if it delays launch.
- [ ] AdSense/banner ads are post-launch unless only testing layout.
- [ ] Shared generator shell refactor is not a blocker.
- [ ] Preview polish beyond trust/safety is not a blocker.
- [ ] Makeup, Stitch, Paint productisation is not a blocker.

## UAT Test Matrix
Run these before live launch.

### Critical UAT
- [ ] UAT-001 Register new customer.
- [ ] UAT-002 Login/logout/reset password.
- [ ] UAT-003 Create valid tray.
- [ ] UAT-004 Save and reload tray.
- [ ] UAT-005 Export STL after entitlement/payment rule.
- [ ] UAT-007 Upload valid STL.
- [ ] UAT-008 Reject invalid upload.
- [ ] UAT-009 Successful payment creates order.
- [ ] UAT-010 Failed payment handled.
- [ ] UAT-013 Order appears in account.
- [ ] UAT-014 Provider sees assigned print job.
- [ ] UAT-015 Provider/customer status sync.
- [ ] UAT-017 Cross-user order access blocked.
- [ ] UAT-018 Private STL access blocked.
- [ ] UAT-019 Secrets not exposed.
- [ ] UAT-020 Files survive redeploy.
- [ ] UAT-023 HTTPS enforced.
- [ ] UAT-027 Legal links available.
- [ ] UAT-028 Rollback works.
- [ ] UAT-029 Backup/restore drill.
- [ ] UAT-030 Friendly user completes full route.

### High Priority UAT
- [ ] UAT-006 Oversized tray boundary handling.
- [ ] UAT-011 Duplicate checkout click/submission protection.
- [ ] UAT-012 Refund updates records.
- [ ] UAT-016 Provider decline job before production.
- [ ] UAT-021 Order email received.
- [ ] UAT-022 Contact/support works.
- [ ] UAT-024 iPhone Safari core route.
- [ ] UAT-025 Android Chrome core route.
- [ ] UAT-026 Basic load sanity.

## Required Evidence Per Completed Blocker
For every completed blocker, comment with at least one of:

- PR/commit link
- screenshot path or uploaded screenshot
- UAT result
- Stripe test/live event ID
- Supabase record/storage evidence
- Render deploy/log evidence
- written test note explaining exact route tested

## Deployment Runbook
- [ ] Confirm all critical blockers complete or deliberately deferred with John approval.
- [ ] Compile production env var inventory.
- [ ] Confirm Stripe live account verified.
- [ ] Set Render production branch and env vars.
- [ ] Configure Supabase production project, RLS, storage and backups.
- [ ] Deploy latest release/main commit.
- [ ] Run smoke tests.
- [ ] Point forgetabout.im and www to production.
- [ ] Force HTTPS.
- [ ] Run critical UAT subset.
- [ ] Run low-value live transaction and refund once John has registered/verified site/company.
- [ ] Soft launch to 5–10 friendly users.
- [ ] Check Render/Supabase/Stripe logs twice daily during first week.

## Rollback Plan
- [ ] If critical production bug: pause launch promotion and disable checkout/affected route.
- [ ] If bad code deploy: rollback Render to previous successful deploy or redeploy previous known-good commit.
- [ ] If payment bug: disable checkout/live payment route while preserving support/contact.
- [ ] If data leak suspected: disable affected route, rotate keys, preserve logs, investigate.
- [ ] If corrupt order/file data: restore from backup or manually correct records.
- [ ] After rollback: rerun smoke tests and record evidence.

## Inputs Needed From John Before Final Live Execution
- [ ] Company/trading entity details: company name, number, registered address, VAT status if applicable.
- [ ] DNS access for forgetabout.im.
- [ ] Stripe live account access and verified account status.
- [ ] Stripe live webhook signing secret, set only via secure env vars.
- [ ] Production Supabase project details and secure env var process.
- [ ] Render production service access.
- [ ] Support email account, e.g. support@forgetabout.im.
- [ ] Transactional email provider/SMTP details.
- [ ] Legal wording approval for Terms, Privacy, Cookie and Refund/Cancellation.
- [ ] Refund/cancellation rules for digital downloads and print orders.
- [ ] Printer/provider test account details.
- [ ] 5–10 friendly-user test emails.
- [ ] Launch pricing for download, print route, platform fee and postage/materials.
- [ ] Analytics preference, if any.

## Go / No-Go Rule
Go-live requires:

- 0 open Critical blockers.
- 0 open High blockers unless explicitly accepted by John.
- 0 failed critical UAT cases.
- Production rollback tested.
- Legal pages live.
- Stripe live test complete.
- Soft launch complete.

## Instruction to Codex
Start with the critical blockers in this file. Create PRs grouped by workstream where sensible. Do not build future roadmap features unless they are required to pass launch blockers. Return evidence and remaining asks in the related GitHub issue comments.