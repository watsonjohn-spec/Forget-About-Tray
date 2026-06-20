create extension if not exists pgcrypto;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('user-stl-uploads', 'user-stl-uploads', false, 12000000, array['model/stl', 'application/octet-stream'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can read their stored STL uploads" on storage.objects;
create policy "Users can read their stored STL uploads"
  on storage.objects for select to authenticated
  using (bucket_id = 'user-stl-uploads' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Users can insert their stored STL uploads" on storage.objects;
create policy "Users can insert their stored STL uploads"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'user-stl-uploads' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Users can update their stored STL uploads" on storage.objects;
create policy "Users can update their stored STL uploads"
  on storage.objects for update to authenticated
  using (bucket_id = 'user-stl-uploads' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'user-stl-uploads' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Users can delete their stored STL uploads" on storage.objects;
create policy "Users can delete their stored STL uploads"
  on storage.objects for delete to authenticated
  using (bucket_id = 'user-stl-uploads' and (storage.foldername(name))[1] = (select auth.uid())::text);

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  default_address jsonb not null default '{}'::jsonb,
  marketing_consent boolean not null default false,
  free_export_used boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tray_designs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_ref text not null,
  name text not null,
  configuration jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, client_ref)
);

create table if not exists public.army_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_ref text not null,
  name text not null,
  original_list_text text not null default '',
  parsed_units jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, client_ref)
);

create table if not exists public.brands (
  key text primary key,
  name text not null,
  path text not null unique,
  enabled boolean not null default false,
  entitlement_scope text not null default 'brand' check (entitlement_scope in ('brand', 'generator')),
  theme jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.generator_definitions (
  type text primary key,
  name text not null,
  current_version integer not null default 1,
  parameter_catalogue_type text,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.brand_generators (
  brand_key text not null references public.brands(key) on delete cascade,
  generator_type text not null references public.generator_definitions(type) on delete cascade,
  enabled boolean not null default false,
  settings jsonb not null default '{}'::jsonb,
  primary key (brand_key, generator_type)
);

insert into public.brands (key, name, path, enabled, entitlement_scope)
values
  ('tray', 'Forget About Tray', 'tray', true, 'brand'),
  ('makeup', 'Forget About Makeup', 'makeup', true, 'brand'),
  ('print', 'Forget About Print', 'print', true, 'brand'),
  ('paint', 'Forget About Paint', 'paint', true, 'brand'),
  ('stitch', 'Forget About Stitch', 'stitch', true, 'brand'),
  ('crosstitch', 'Forget About Crosstitch', 'crosstitch', false, 'brand'),
  ('board-games', 'Forget About Board Games', 'board-games', false, 'brand')
on conflict (key) do update set name = excluded.name, path = excluded.path, enabled = excluded.enabled, entitlement_scope = excluded.entitlement_scope;

insert into public.generator_definitions (type, name, current_version, parameter_catalogue_type, enabled)
values
  ('movement_tray', 'Movement tray', 1, 'old_world_units', true),
  ('makeup_caddy', 'Makeup caddy', 1, 'makeup_products', true),
  ('uploaded_print', 'Uploaded STL print', 1, 'uploaded_stl', true),
  ('paint_station', 'Paint station', 1, 'paint_bottles', true),
  ('stitch_organizer', 'Stitch organizer', 1, 'thread_references', true)
on conflict (type) do update set name = excluded.name, current_version = excluded.current_version, parameter_catalogue_type = excluded.parameter_catalogue_type, enabled = excluded.enabled;

insert into public.brand_generators (brand_key, generator_type, enabled)
values
  ('tray', 'movement_tray', true),
  ('makeup', 'makeup_caddy', true),
  ('print', 'uploaded_print', true),
  ('paint', 'paint_station', true),
  ('stitch', 'stitch_organizer', true)
on conflict (brand_key, generator_type) do update set enabled = excluded.enabled;

create table if not exists public.designs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  brand_key text not null references public.brands(key),
  generator_type text not null references public.generator_definitions(type),
  generator_version integer not null default 1,
  client_ref text not null,
  name text not null,
  parameters jsonb not null,
  catalogue_context jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, brand_key, generator_type, client_ref)
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  brand_key text not null references public.brands(key),
  generator_type text not null references public.generator_definitions(type),
  client_ref text not null,
  project_type text not null,
  name text not null,
  source_text text not null default '',
  items jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, brand_key, generator_type, client_ref)
);

insert into public.designs (user_id, brand_key, generator_type, generator_version, client_ref, name, parameters, metadata, created_at, updated_at)
select user_id, 'tray', 'movement_tray', 1, client_ref, name, configuration, '{"migrated_from":"tray_designs"}'::jsonb, created_at, updated_at
from public.tray_designs
on conflict (user_id, brand_key, generator_type, client_ref) do nothing;

insert into public.projects (user_id, brand_key, generator_type, client_ref, project_type, name, source_text, items, metadata, created_at, updated_at)
select user_id, 'tray', 'movement_tray', client_ref, 'army_list', name, original_list_text, parsed_units, '{"migrated_from":"army_lists"}'::jsonb, created_at, updated_at
from public.army_lists
on conflict (user_id, brand_key, generator_type, client_ref) do nothing;

create table if not exists public.generator_catalogues (
  id uuid primary key default gen_random_uuid(),
  brand_key text references public.brands(key) on delete cascade,
  generator_type text not null references public.generator_definitions(type) on delete cascade,
  key text not null,
  name text not null,
  version integer not null default 1,
  enabled boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  unique (generator_type, key, version)
);

create table if not exists public.generator_catalogue_items (
  id uuid primary key default gen_random_uuid(),
  catalogue_id uuid not null references public.generator_catalogues(id) on delete cascade,
  key text not null,
  name text not null,
  parameter_defaults jsonb not null,
  filters jsonb not null default '{}'::jsonb,
  aliases text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  unique (catalogue_id, key)
);

create sequence if not exists public.order_invoice_number_seq;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  invoice_number text unique default ('FAT-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.order_invoice_number_seq')::text, 6, '0')),
  order_type text not null,
  status text not null default 'pending_payment',
  currency text not null default 'gbp',
  subtotal_ex_vat integer,
  vat_rate numeric(6,3),
  vat_amount integer,
  postage_ex_vat integer,
  total_inc_vat integer not null,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,
  tax_point timestamptz,
  paid_at timestamptz,
  retention_until timestamptz not null default (now() + interval '6 years'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.orders add column if not exists brand_key text references public.brands(key);
alter table public.orders add column if not exists generator_type text references public.generator_definitions(type);
alter table public.orders add column if not exists refund_locked_at timestamptz;
alter table public.orders drop constraint if exists orders_order_type_check;
update public.orders set brand_key = 'tray' where brand_key is null;
update public.orders set generator_type = 'movement_tray' where generator_type is null;

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  description text not null,
  quantity integer not null default 1 check (quantity > 0),
  unit_price_ex_vat integer,
  vat_rate numeric(6,3),
  vat_amount integer,
  total_inc_vat integer not null,
  tray_configuration jsonb,
  created_at timestamptz not null default now()
);

alter table public.order_items add column if not exists design_snapshot jsonb;

create table if not exists public.order_customer_snapshots (
  order_id uuid primary key references public.orders(id) on delete restrict,
  customer_name text,
  customer_email text,
  billing_address jsonb not null default '{}'::jsonb,
  delivery_address jsonb not null default '{}'::jsonb,
  country_code text,
  created_at timestamptz not null default now()
);

create table if not exists public.entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entitlement_type text not null,
  source_order_id uuid references public.orders(id) on delete set null,
  stripe_checkout_session_id text,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (user_id, entitlement_type)
);

alter table public.entitlements add column if not exists brand_key text references public.brands(key);
alter table public.entitlements add column if not exists generator_type text references public.generator_definitions(type);
update public.entitlements set brand_key = 'tray' where brand_key is null;
update public.entitlements
set generator_type = null
where brand_key in (select key from public.brands where entitlement_scope = 'brand');
alter table public.entitlements drop constraint if exists entitlements_user_id_entitlement_type_key;
alter table public.entitlements drop constraint if exists entitlements_scope_unique;
alter table public.entitlements add constraint entitlements_scope_unique unique nulls not distinct (user_id, entitlement_type, brand_key, generator_type);

create table if not exists public.usage_allowances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  brand_key text not null references public.brands(key),
  generator_type text not null references public.generator_definitions(type),
  allowance_type text not null,
  used_count integer not null default 0 check (used_count >= 0),
  limit_count integer check (limit_count is null or limit_count >= 0),
  updated_at timestamptz not null default now(),
  unique (user_id, brand_key, generator_type, allowance_type)
);

create table if not exists public.account_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_hash text not null,
  friendly_name text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (user_id, device_hash)
);

create table if not exists public.printer_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete restrict,
  display_name text not null,
  description text,
  based_in text not null,
  postcode_area text not null,
  rating_average numeric(3,2) not null default 0,
  rating_count integer not null default 0,
  lead_time_days integer not null default 7 check (lead_time_days > 0),
  status text not null default 'pending_review' check (status in ('pending_review', 'active', 'paused', 'suspended')),
  accepting_jobs boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.printer_payment_accounts (
  printer_profile_id uuid primary key references public.printer_profiles(id) on delete restrict,
  stripe_connected_account_id text not null unique,
  charges_enabled boolean not null default false,
  transfers_enabled boolean not null default false,
  onboarding_complete boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.printer_capabilities (
  id uuid primary key default gen_random_uuid(),
  printer_profile_id uuid not null references public.printer_profiles(id) on delete cascade,
  process text not null default 'fdm',
  material text not null,
  colour_key text not null,
  colour_name text not null,
  colour_hex text,
  max_width_mm numeric not null,
  max_depth_mm numeric not null,
  max_height_mm numeric not null,
  base_price_pence integer not null check (base_price_pence >= 0),
  price_per_cm3_pence integer not null check (price_per_cm3_pence >= 0),
  postage_pence integer not null default 0 check (postage_pence >= 0),
  active boolean not null default true,
  unique (printer_profile_id, process, material, colour_key)
);

alter table public.printer_capabilities add column if not exists grams_per_hour numeric not null default 12 check (grams_per_hour > 0);
alter table public.printer_capabilities add column if not exists postage_service text not null default 'evri-standard';
alter table public.printer_capabilities add column if not exists postage_days integer not null default 3 check (postage_days > 0);

create table if not exists public.print_quotes (
  id uuid primary key default gen_random_uuid(),
  customer_user_id uuid not null references auth.users(id) on delete cascade,
  printer_profile_id uuid not null references public.printer_profiles(id) on delete restrict,
  brand_key text not null references public.brands(key),
  generator_type text not null references public.generator_definitions(type),
  design_snapshot jsonb not null,
  colour_key text not null,
  material text not null,
  production_price_pence integer not null,
  postage_pence integer not null,
  platform_fee_pence integer not null,
  vat_amount_pence integer not null,
  total_inc_vat_pence integer not null,
  provider_share_pence integer not null,
  currency text not null default 'gbp',
  lead_time_days integer not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.print_quotes add column if not exists estimated_weight_grams numeric;
alter table public.print_quotes add column if not exists estimated_print_hours numeric;
alter table public.print_quotes add column if not exists handling_days integer;
alter table public.print_quotes add column if not exists postage_service text;
alter table public.print_quotes add column if not exists postage_days integer;
alter table public.print_quotes add column if not exists material_cost_pence integer not null default 0;
alter table public.print_quotes add column if not exists printer_fee_pence integer not null default 0;
alter table public.print_quotes add column if not exists commission_pence integer not null default 0;

create table if not exists public.print_jobs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete restrict,
  customer_user_id uuid references auth.users(id) on delete set null,
  printer_profile_id uuid not null references public.printer_profiles(id) on delete restrict,
  quote_id uuid references public.print_quotes(id) on delete set null,
  brand_key text not null references public.brands(key),
  generator_type text not null references public.generator_definitions(type),
  design_snapshot jsonb not null,
  colour_key text not null,
  material text not null,
  status text not null default 'pending_payment' check (status in ('pending_payment', 'order_made', 'producing', 'posted', 'complete', 'cancelled', 'refunded')),
  provider_share_pence integer not null,
  payout_status text not null default 'held' check (payout_status in ('held', 'ready', 'transferred', 'failed', 'reversed')),
  tracking_reference text,
  producing_at timestamptz,
  posted_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.print_jobs add column if not exists material_cost_pence integer not null default 0;
alter table public.print_jobs add column if not exists printer_fee_pence integer not null default 0;
alter table public.print_jobs add column if not exists platform_fee_pence integer not null default 0;
alter table public.print_jobs add column if not exists commission_pence integer not null default 0;
alter table public.print_jobs add column if not exists postage_pence integer not null default 0;

create table if not exists public.print_job_events (
  id uuid primary key default gen_random_uuid(),
  print_job_id uuid not null references public.print_jobs(id) on delete restrict,
  actor_user_id uuid references auth.users(id) on delete set null,
  from_status text,
  to_status text not null,
  note text,
  created_at timestamptz not null default now()
);

alter table public.print_job_events add column if not exists event_type text not null default 'status';
alter table public.print_job_events drop constraint if exists print_job_events_event_type_check;
alter table public.print_job_events add constraint print_job_events_event_type_check
  check (event_type in ('status', 'provider_message', 'customer_message', 'decline', 'auto_complete', 'delivery_chaser'));

create table if not exists public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  print_job_id uuid references public.print_jobs(id) on delete set null,
  recipient_email text not null,
  email_type text not null,
  subject text not null,
  body_text text not null,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'skipped')),
  provider_message_id text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  error text
);

create table if not exists public.provider_transfers (
  id uuid primary key default gen_random_uuid(),
  print_job_id uuid not null unique references public.print_jobs(id) on delete restrict,
  printer_profile_id uuid not null references public.printer_profiles(id) on delete restrict,
  amount_pence integer not null check (amount_pence > 0),
  currency text not null default 'gbp',
  stripe_transfer_id text unique,
  status text not null default 'held' check (status in ('held', 'ready', 'transferred', 'failed', 'reversed')),
  transferred_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.provider_reviews (
  id uuid primary key default gen_random_uuid(),
  print_job_id uuid not null unique references public.print_jobs(id) on delete restrict,
  customer_user_id uuid references auth.users(id) on delete set null,
  printer_profile_id uuid not null references public.printer_profiles(id) on delete restrict,
  rating integer not null check (rating between 1 and 5),
  review_text text,
  created_at timestamptz not null default now()
);

alter table public.print_jobs drop constraint if exists print_jobs_payout_requires_complete;
alter table public.print_jobs add constraint print_jobs_payout_requires_complete
  check (payout_status not in ('ready', 'transferred') or status = 'complete');

create or replace function public.enforce_print_job_financial_state()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if old.status in ('producing', 'posted', 'complete') and new.status in ('cancelled', 'refunded') then
    raise exception 'Customer refunds are locked once production begins';
  end if;
  if new.payout_status in ('ready', 'transferred') and new.status <> 'complete' then
    raise exception 'Provider payout cannot be released before completion';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_print_job_financial_state on public.print_jobs;
create trigger enforce_print_job_financial_state
  before update on public.print_jobs
  for each row execute procedure public.enforce_print_job_financial_state();

revoke execute on function public.enforce_print_job_financial_state() from anon, authenticated, public;

create or replace function public.enforce_provider_transfer_completion()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if new.status in ('ready', 'transferred') and not exists (
    select 1 from public.print_jobs where id = new.print_job_id and status = 'complete'
  ) then
    raise exception 'Provider transfer cannot be released before print job completion';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_provider_transfer_completion on public.provider_transfers;
create trigger enforce_provider_transfer_completion
  before insert or update on public.provider_transfers
  for each row execute procedure public.enforce_provider_transfer_completion();

revoke execute on function public.enforce_provider_transfer_completion() from anon, authenticated, public;

create table if not exists public.stripe_events (
  stripe_event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);

create table if not exists public.privacy_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text not null,
  request_type text not null check (request_type in ('account_deletion', 'data_correction')),
  status text not null default 'requested',
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  notes text
);

create index if not exists tray_designs_user_id_idx on public.tray_designs(user_id);
create index if not exists army_lists_user_id_idx on public.army_lists(user_id);
create index if not exists orders_user_id_idx on public.orders(user_id);
create index if not exists order_items_order_id_idx on public.order_items(order_id);
create index if not exists entitlements_user_id_idx on public.entitlements(user_id);
create index if not exists designs_user_brand_generator_idx on public.designs(user_id, brand_key, generator_type);
create index if not exists projects_user_brand_generator_idx on public.projects(user_id, brand_key, generator_type);
create index if not exists print_jobs_customer_idx on public.print_jobs(customer_user_id, created_at desc);
create index if not exists print_jobs_printer_idx on public.print_jobs(printer_profile_id, status, created_at desc);
create index if not exists printer_capabilities_filter_idx on public.printer_capabilities(active, material, colour_key);
create index if not exists account_devices_user_idx on public.account_devices(user_id, revoked_at);
create index if not exists brand_generators_generator_type_idx on public.brand_generators(generator_type);
create index if not exists designs_brand_key_idx on public.designs(brand_key);
create index if not exists designs_generator_type_idx on public.designs(generator_type);
create index if not exists entitlements_brand_key_idx on public.entitlements(brand_key);
create index if not exists entitlements_generator_type_idx on public.entitlements(generator_type);
create index if not exists entitlements_source_order_id_idx on public.entitlements(source_order_id);
create index if not exists email_outbox_user_id_idx on public.email_outbox(user_id, created_at desc);
create index if not exists email_outbox_print_job_id_idx on public.email_outbox(print_job_id, created_at desc);
create index if not exists generator_catalogues_brand_key_idx on public.generator_catalogues(brand_key);
create index if not exists orders_brand_key_idx on public.orders(brand_key);
create index if not exists orders_generator_type_idx on public.orders(generator_type);
create index if not exists print_job_events_actor_user_id_idx on public.print_job_events(actor_user_id);
create index if not exists print_job_events_print_job_id_idx on public.print_job_events(print_job_id);
create index if not exists print_jobs_brand_key_idx on public.print_jobs(brand_key);
create index if not exists print_jobs_generator_type_idx on public.print_jobs(generator_type);
create index if not exists print_jobs_quote_id_idx on public.print_jobs(quote_id);
create index if not exists print_quotes_brand_key_idx on public.print_quotes(brand_key);
create index if not exists print_quotes_customer_user_id_idx on public.print_quotes(customer_user_id);
create index if not exists print_quotes_generator_type_idx on public.print_quotes(generator_type);
create index if not exists print_quotes_printer_profile_id_idx on public.print_quotes(printer_profile_id);
create index if not exists privacy_requests_user_id_idx on public.privacy_requests(user_id);
create index if not exists projects_brand_key_idx on public.projects(brand_key);
create index if not exists projects_generator_type_idx on public.projects(generator_type);
create index if not exists provider_reviews_customer_user_id_idx on public.provider_reviews(customer_user_id);
create index if not exists provider_reviews_printer_profile_id_idx on public.provider_reviews(printer_profile_id);
create index if not exists provider_transfers_printer_profile_id_idx on public.provider_transfers(printer_profile_id);
create index if not exists usage_allowances_brand_key_idx on public.usage_allowances(brand_key);
create index if not exists usage_allowances_generator_type_idx on public.usage_allowances(generator_type);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (user_id, email)
  values (new.id, coalesce(new.email, ''))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

revoke execute on function public.handle_new_user() from anon, authenticated, public;

insert into public.profiles (user_id, email)
select id, coalesce(email, '') from auth.users
on conflict (user_id) do nothing;

alter table public.profiles enable row level security;
alter table public.tray_designs enable row level security;
alter table public.army_lists enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_customer_snapshots enable row level security;
alter table public.entitlements enable row level security;
alter table public.stripe_events enable row level security;
alter table public.privacy_requests enable row level security;
alter table public.brands enable row level security;
alter table public.generator_definitions enable row level security;
alter table public.brand_generators enable row level security;
alter table public.designs enable row level security;
alter table public.projects enable row level security;
alter table public.generator_catalogues enable row level security;
alter table public.generator_catalogue_items enable row level security;
alter table public.usage_allowances enable row level security;
alter table public.account_devices enable row level security;
alter table public.printer_profiles enable row level security;
alter table public.printer_payment_accounts enable row level security;
alter table public.printer_capabilities enable row level security;
alter table public.print_quotes enable row level security;
alter table public.print_jobs enable row level security;
alter table public.print_job_events enable row level security;
alter table public.provider_transfers enable row level security;
alter table public.provider_reviews enable row level security;
alter table public.email_outbox enable row level security;

drop policy if exists "Users can view their profile" on public.profiles;
create policy "Users can view their profile" on public.profiles
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Users can update their profile" on public.profiles;
create policy "Users can update their profile" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage their tray designs" on public.tray_designs;
create policy "Users manage their tray designs" on public.tray_designs
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage their army lists" on public.army_lists;
create policy "Users manage their army lists" on public.army_lists
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users view their orders" on public.orders;
create policy "Users view their orders" on public.orders
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Users view their order items" on public.order_items;
create policy "Users view their order items" on public.order_items
  for select to authenticated using (
    exists (select 1 from public.orders where orders.id = order_items.order_id and orders.user_id = (select auth.uid()))
  );

drop policy if exists "Users view their order customer snapshots" on public.order_customer_snapshots;
create policy "Users view their order customer snapshots" on public.order_customer_snapshots
  for select to authenticated using (
    exists (select 1 from public.orders where orders.id = order_customer_snapshots.order_id and orders.user_id = (select auth.uid()))
  );

drop policy if exists "Users view their entitlements" on public.entitlements;
create policy "Users view their entitlements" on public.entitlements
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Users view their privacy requests" on public.privacy_requests;
create policy "Users view their privacy requests" on public.privacy_requests
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Anyone views enabled brands" on public.brands;
create policy "Anyone views enabled brands" on public.brands
  for select to anon, authenticated using (enabled = true);

drop policy if exists "Anyone views enabled generators" on public.generator_definitions;
create policy "Anyone views enabled generators" on public.generator_definitions
  for select to anon, authenticated using (enabled = true);

drop policy if exists "Anyone views enabled brand generators" on public.brand_generators;
create policy "Anyone views enabled brand generators" on public.brand_generators
  for select to anon, authenticated using (enabled = true);

drop policy if exists "Users manage their designs" on public.designs;
create policy "Users manage their designs" on public.designs
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage their projects" on public.projects;
create policy "Users manage their projects" on public.projects
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Anyone views generator catalogues" on public.generator_catalogues;
create policy "Anyone views generator catalogues" on public.generator_catalogues
  for select to anon, authenticated using (enabled = true);

drop policy if exists "Anyone views generator catalogue items" on public.generator_catalogue_items;
create policy "Anyone views generator catalogue items" on public.generator_catalogue_items
  for select to anon, authenticated using (
    exists (select 1 from public.generator_catalogues where generator_catalogues.id = generator_catalogue_items.catalogue_id and generator_catalogues.enabled = true)
  );

drop policy if exists "Users view their usage allowances" on public.usage_allowances;
create policy "Users view their usage allowances" on public.usage_allowances
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Users view their account devices" on public.account_devices;
create policy "Users view their account devices" on public.account_devices
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Anyone views active printer profiles" on public.printer_profiles;
create policy "Anyone views active printer profiles" on public.printer_profiles
  for select to anon, authenticated using (status = 'active');

drop policy if exists "Printers view their own profile" on public.printer_profiles;
create policy "Printers view their own profile" on public.printer_profiles
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Printers update their own profile" on public.printer_profiles;
create policy "Printers update their own profile" on public.printer_profiles
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Printers view their payment account" on public.printer_payment_accounts;
create policy "Printers view their payment account" on public.printer_payment_accounts
  for select to authenticated using (
    exists (select 1 from public.printer_profiles where printer_profiles.id = printer_payment_accounts.printer_profile_id and printer_profiles.user_id = (select auth.uid()))
  );

drop policy if exists "Anyone views active printer capabilities" on public.printer_capabilities;
create policy "Anyone views active printer capabilities" on public.printer_capabilities
  for select to anon, authenticated using (
    active = true and exists (
      select 1 from public.printer_profiles
      where printer_profiles.id = printer_capabilities.printer_profile_id
        and printer_profiles.status = 'active'
        and printer_profiles.accepting_jobs = true
    )
  );

drop policy if exists "Printers manage their capabilities" on public.printer_capabilities;
create policy "Printers manage their capabilities" on public.printer_capabilities
  for all to authenticated
  using (
    exists (select 1 from public.printer_profiles where printer_profiles.id = printer_capabilities.printer_profile_id and printer_profiles.user_id = (select auth.uid()))
  )
  with check (
    exists (select 1 from public.printer_profiles where printer_profiles.id = printer_capabilities.printer_profile_id and printer_profiles.user_id = (select auth.uid()))
  );

drop policy if exists "Customers view their print quotes" on public.print_quotes;
create policy "Customers view their print quotes" on public.print_quotes
  for select to authenticated using ((select auth.uid()) = customer_user_id);

drop policy if exists "Participants view print jobs" on public.print_jobs;
create policy "Participants view print jobs" on public.print_jobs
  for select to authenticated using (
    (select auth.uid()) = customer_user_id
    or exists (select 1 from public.printer_profiles where printer_profiles.id = print_jobs.printer_profile_id and printer_profiles.user_id = (select auth.uid()))
  );

drop policy if exists "Participants view print job events" on public.print_job_events;
create policy "Participants view print job events" on public.print_job_events
  for select to authenticated using (
    exists (
      select 1 from public.print_jobs
      left join public.printer_profiles on printer_profiles.id = print_jobs.printer_profile_id
      where print_jobs.id = print_job_events.print_job_id
        and (print_jobs.customer_user_id = (select auth.uid()) or printer_profiles.user_id = (select auth.uid()))
    )
  );

drop policy if exists "Users view their email outbox" on public.email_outbox;
create policy "Users view their email outbox" on public.email_outbox
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Printers view their transfers" on public.provider_transfers;
create policy "Printers view their transfers" on public.provider_transfers
  for select to authenticated using (
    exists (select 1 from public.printer_profiles where printer_profiles.id = provider_transfers.printer_profile_id and printer_profiles.user_id = (select auth.uid()))
  );

drop policy if exists "Anyone views provider reviews" on public.provider_reviews;
create policy "Anyone views provider reviews" on public.provider_reviews
  for select to anon, authenticated using (true);

grant select on public.profiles, public.orders, public.order_items, public.order_customer_snapshots, public.entitlements, public.privacy_requests to authenticated;
grant select, insert, update, delete on public.tray_designs, public.army_lists to authenticated;
grant select on public.brands, public.generator_definitions, public.brand_generators, public.generator_catalogues, public.generator_catalogue_items, public.printer_profiles, public.printer_capabilities, public.provider_reviews to anon, authenticated;
grant select, insert, update, delete on public.designs, public.projects to authenticated;
grant select on public.usage_allowances, public.account_devices, public.printer_payment_accounts, public.print_quotes, public.print_jobs, public.print_job_events, public.provider_transfers, public.email_outbox to authenticated;
grant insert, update, delete on public.printer_capabilities to authenticated;
grant update (display_name, description, based_in, postcode_area, lead_time_days, accepting_jobs, updated_at) on public.printer_profiles to authenticated;
revoke update on public.profiles from authenticated;
grant update (display_name, default_address, marketing_consent, updated_at) on public.profiles to authenticated;
grant all on public.profiles, public.tray_designs, public.army_lists, public.orders, public.order_items, public.order_customer_snapshots, public.entitlements, public.stripe_events, public.privacy_requests, public.brands, public.generator_definitions, public.brand_generators, public.designs, public.projects, public.generator_catalogues, public.generator_catalogue_items, public.usage_allowances, public.account_devices, public.printer_profiles, public.printer_payment_accounts, public.printer_capabilities, public.print_quotes, public.print_jobs, public.print_job_events, public.provider_transfers, public.provider_reviews, public.email_outbox to service_role;
grant usage, select on sequence public.order_invoice_number_seq to service_role;
