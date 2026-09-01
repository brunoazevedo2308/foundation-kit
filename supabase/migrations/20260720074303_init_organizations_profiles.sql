-- DP Suite — TT-003.1
-- Initial versioned migration: organizations + profiles.
--
-- Apply from your machine against dp-suite-dev with the Supabase CLI:
--   supabase link --project-ref lyxonmqsldtsixdhcaww
--   supabase db push
--
-- Scope:
--   * Enable UUID generation (pgcrypto).
--   * Create `organizations` and `profiles` tables only.
--   * `profiles.id` is FK to `auth.users.id` (Supabase Auth is the identity source).
--   * Standard timestamps + soft-delete columns.
--   * Enable Row Level Security on both tables so they are LOCKED BY DEFAULT.
--     Access policies are introduced in a later migration (TT-003.x).
--
-- NOT in scope: RLS policies, triggers beyond updated_at, other business tables.

-- -----------------------------------------------------------------------------
-- Extensions
-- -----------------------------------------------------------------------------
create extension if not exists "pgcrypto" with schema public;

-- -----------------------------------------------------------------------------
-- Shared trigger: keep updated_at fresh on UPDATE.
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =============================================================================
-- Table: public.organizations
-- =============================================================================
create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

comment on table  public.organizations is 'Tenant organizations. Root scope for DP Suite governance data.';
comment on column public.organizations.slug       is 'URL-safe unique identifier for the organization.';
comment on column public.organizations.deleted_at is 'Soft-delete marker. NULL = active row.';

create index organizations_active_idx on public.organizations (created_at desc)
  where deleted_at is null;

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

-- Data API grants (PostgREST). Policies are added in a later migration;
-- RLS is enabled below so the table stays locked until then.
grant select, insert, update, delete on public.organizations to authenticated;
grant all on public.organizations to service_role;

alter table public.organizations enable row level security;

-- =============================================================================
-- Table: public.profiles
-- =============================================================================
-- `id` mirrors `auth.users.id` (1:1). Cascade on user deletion so orphaned
-- profiles cannot exist. `organization_id` is nullable for now — membership
-- and role assignment come with a later task.
create table public.profiles (
  id               uuid primary key
                     references auth.users(id) on delete cascade,
  organization_id  uuid
                     references public.organizations(id) on delete set null,
  full_name        text,
  avatar_url       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

comment on table  public.profiles is 'Public user profile, one-to-one with auth.users.';
comment on column public.profiles.id              is 'Matches auth.users.id (identity source).';
comment on column public.profiles.organization_id is 'Primary organization (nullable until membership model is introduced).';
comment on column public.profiles.deleted_at      is 'Soft-delete marker. NULL = active row.';

create index profiles_organization_id_idx on public.profiles (organization_id)
  where deleted_at is null;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.profiles to authenticated;
grant all on public.profiles to service_role;

alter table public.profiles enable row level security;
