-- =====================================================================
-- MGO forecasting DB — current sprint schema
-- Tables: users, purchase_plans, market_series, market_observations
-- Source: mgo_forecasting_database_schema.html (current-sprint diagram)
-- =====================================================================

create extension if not exists "pgcrypto";  -- for gen_random_uuid()

-- ---------------------------------------------------------------------
-- USERS
-- Profile table keyed to Supabase Auth's auth.users, since no local
-- password-storage mechanism is assumed by the schema doc.
-- ---------------------------------------------------------------------
create table if not exists public.users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email   text not null unique
);

-- Keep public.users in sync automatically when someone signs up via Supabase Auth
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (user_id, email)
  values (new.id, new.email)
  on conflict (user_id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update of email on auth.users
  for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------------
-- PURCHASE_PLANS
-- One plan per user (user_id required + unique). Quantity must be positive.
-- ---------------------------------------------------------------------
create table if not exists public.purchase_plans (
  plan_id             uuid primary key default gen_random_uuid(),
  user_id             uuid not null unique references public.users (user_id) on delete cascade,
  quantity_mt         numeric not null check (quantity_mt > 0),
  purchase_deadline   date not null,
  scenario_as_of_date date not null
);

-- ---------------------------------------------------------------------
-- MARKET_SERIES
-- Distinct series_key per price measure/contract. Currency = USD for
-- monetary series; unit/price_definition/contract_description are TBC
-- fields, left nullable until verified.
-- ---------------------------------------------------------------------
create table if not exists public.market_series (
  series_id            uuid primary key default gen_random_uuid(),
  series_key           text not null unique,
  source_name          text not null,
  source_url           text,
  currency_code        text,      -- e.g. 'USD'; null allowed for non-monetary indicators
  unit                 text,      -- TBC per schema doc
  price_definition     text,      -- TBC per schema doc
  contract_description text       -- TBC per schema doc
);

-- ---------------------------------------------------------------------
-- MARKET_OBSERVATIONS
-- Composite unique key (series_id, observation_date). Unknown publication
-- time stays null — never inferred from observation_date.
-- ---------------------------------------------------------------------
create table if not exists public.market_observations (
  observation_id         uuid primary key default gen_random_uuid(),
  series_id              uuid not null references public.market_series (series_id) on delete restrict,
  observation_date       date not null,
  value                  numeric not null,
  value_type             text not null,
  availability_timestamp timestamptz,  -- nullable: unknown != inferred
  unique (series_id, observation_date)
);

create index if not exists idx_market_observations_series_date
  on public.market_observations (series_id, observation_date);

-- =====================================================================
-- Row Level Security
-- =====================================================================

alter table public.users enable row level security;
alter table public.purchase_plans enable row level security;
alter table public.market_series enable row level security;
alter table public.market_observations enable row level security;

-- USERS: a person can see/update only their own row
create policy "users_select_own" on public.users
  for select using (auth.uid() = user_id);

create policy "users_update_own" on public.users
  for update using (auth.uid() = user_id);

-- PURCHASE_PLANS: full CRUD, but only on your own plan ("enforce ownership
-- for all private reads and writes")
create policy "purchase_plans_select_own" on public.purchase_plans
  for select using (auth.uid() = user_id);

create policy "purchase_plans_insert_own" on public.purchase_plans
  for insert with check (auth.uid() = user_id);

create policy "purchase_plans_update_own" on public.purchase_plans
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "purchase_plans_delete_own" on public.purchase_plans
  for delete using (auth.uid() = user_id);

-- MARKET_SERIES / MARKET_OBSERVATIONS: shared reference data.
-- Readable by any signed-in user; writes reserved for the service role
-- (e.g. your CSV import job), since the doc assigns no per-user
-- ownership over market data.
create policy "market_series_select_authenticated" on public.market_series
  for select using (auth.role() = 'authenticated');

create policy "market_observations_select_authenticated" on public.market_observations
  for select using (auth.role() = 'authenticated');

-- No insert/update/delete policies are defined for market_series or
-- market_observations, so only the service role (which bypasses RLS)
-- can write to them — e.g. from your Gasoil CSV import script.
