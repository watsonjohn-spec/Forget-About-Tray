create extension if not exists pgcrypto;

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

create sequence if not exists public.order_invoice_number_seq;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  invoice_number text unique default ('FAT-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.order_invoice_number_seq')::text, 6, '0')),
  order_type text not null check (order_type in ('printed_tray', 'unlimited_stl')),
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

grant select on public.profiles, public.orders, public.order_items, public.order_customer_snapshots, public.entitlements, public.privacy_requests to authenticated;
grant select, insert, update, delete on public.tray_designs, public.army_lists to authenticated;
revoke update on public.profiles from authenticated;
grant update (display_name, default_address, marketing_consent, updated_at) on public.profiles to authenticated;
grant all on public.profiles, public.tray_designs, public.army_lists, public.orders, public.order_items, public.order_customer_snapshots, public.entitlements, public.stripe_events, public.privacy_requests to service_role;
grant usage, select on sequence public.order_invoice_number_seq to service_role;
