# Playbooks

Repeatable operating steps live here. Keep playbooks literal enough that a future operator or Codex session can follow them without reconstructing the process from chat.

## Existing Operating Routines To Document

- Publish static site to GitHub Pages.
- Deploy the Node backend to Render.
- Apply Supabase schema changes.
- Configure Supabase OAuth providers.
- Configure Stripe Checkout, webhooks, and Connect.
- Approve a new printer profile.
- Investigate a failed print order.
- Process a provider-declined refund.
- Verify analytics, ads, sitemap, and robots after deployment.

## Playbook Template

```text
# Task Name

Purpose:

When to use:

Prerequisites:

Steps:
1. 
2. 
3. 

Verification:

Rollback or recovery:

Related docs:
```

## Supabase Schema Changes

Use the Supabase plugin or SQL editor for schema updates. Prefer narrow, task-specific migrations over replaying the whole schema file unless the task explicitly requires a full rebuild. After applying a schema change, verify the live database metadata and run `npm.cmd run check`.

For event-log changes, also verify:

- Required columns exist.
- RLS policies exist.
- Grants are limited to the intended operations.
- Update/delete/truncate routes are blocked or revoked.
- `platform_events` is included in the Realtime publication when subscriptions are needed.
