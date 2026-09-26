-- =====================================================================
-- MGO forecasting DB — current sprint schema
-- Tables: users, purchase_plans, market_series, market_observations
-- Source: mgo_forecasting_database_schema.html (current-sprint diagram)
-- =====================================================================

create extension if not exists "pgcrypto";  -- for gen_random_uuid()

-- ---------------------------------------------------------------------
-- USERS
-- Application users map verified Clerk accounts to internal UUID owners.
-- ---------------------------------------------------------------------
create table if not exists public.users (
  user_id uuid primary key default gen_random_uuid(),
  clerk_user_id text unique, -- nullable during verified account backfill; never a UUID
  email   text not null unique
);

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

-- No client-facing policies are installed. With RLS enabled, ordinary roles
-- cannot access these tables. Do not replace this with permissive policies.
-- Access is through the trusted backend using a server-only database role
-- with suitable privileges (table owner or BYPASSRLS). Before private CRUD is
-- exposed, the backend must verify Clerk tokens, resolve clerk_user_id to
-- user_id, and enforce ownership on every read/write. The current temporary
-- X-User-Id API header is not verified authentication.
-- User provisioning and email synchronization are backend integration work.
