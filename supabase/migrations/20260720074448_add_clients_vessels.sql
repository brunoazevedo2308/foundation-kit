-- DP Suite — TT-003.2
-- Versioned migration: clients + vessels.
--
-- Apply after 20260720073636_init_organizations_profiles.sql:
--   supabase link --project-ref lyxonmqsldtsixdhcaww
--   supabase db push
--
-- Scope:
--   * Create `public.clients` and `public.vessels` only.
--   * Both tables scoped to an organization via NOT NULL FK (ON DELETE RESTRICT)
--     so organizations cannot be deleted while business data still references them.
--   * Reuse `public.set_updated_at()` created by the previous migration.
--   * Standard timestamps + soft-delete columns.
--   * Enable RLS on both tables so they stay LOCKED BY DEFAULT.
--     Policies are introduced in TT-004.
--
-- NOT in scope: RLS policies, seed data, additional business tables.

-- =============================================================================
-- Table: public.clients
-- =============================================================================
create table public.clients (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null
                     references public.organizations(id) on delete restrict,
  name             text not null,
  code             text,
  contact_name     text,
  contact_email    text,
  contact_phone    text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

comment on table  public.clients is 'Client companies contracted by an organization within DP Suite.';
comment on column public.clients.organization_id is 'Owning organization (tenant scope). Restrict delete to protect referential integrity.';
comment on column public.clients.code            is 'Optional internal identifier/short-code for the client.';
comment on column public.clients.deleted_at      is 'Soft-delete marker. NULL = active row.';

-- Uniqueness among ACTIVE (non-soft-deleted) rows, scoped per organization.
create unique index clients_org_active_name_uidx
  on public.clients (organization_id, name)
  where deleted_at is null;

create unique index clients_org_active_code_uidx
  on public.clients (organization_id, code)
  where deleted_at is null and code is not null;

create index clients_organization_id_idx
  on public.clients (organization_id)
  where deleted_at is null;

create trigger clients_set_updated_at
  before update on public.clients
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.clients to authenticated;
grant all on public.clients to service_role;

alter table public.clients enable row level security;

-- =============================================================================
-- Table: public.vessels
-- =============================================================================
create table public.vessels (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null
                     references public.organizations(id) on delete restrict,
  client_id        uuid
                     references public.clients(id) on delete restrict,
  name             text not null,
  imo_number       text,
  vessel_type      text,
  dp_class         text,
  status           text not null default 'active',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  constraint vessels_status_check check (status in ('active', 'inactive'))
);

comment on table  public.vessels is 'Vessels tracked for Dynamic Positioning governance.';
comment on column public.vessels.organization_id is 'Owning organization (tenant scope).';
comment on column public.vessels.client_id       is 'Optional owning client within the organization.';
comment on column public.vessels.imo_number      is 'International Maritime Organization number, unique per org when set.';
comment on column public.vessels.dp_class        is 'Dynamic Positioning class (e.g. DP1, DP2, DP3).';
comment on column public.vessels.status          is 'Lifecycle status: active | inactive.';
comment on column public.vessels.deleted_at      is 'Soft-delete marker. NULL = active row.';

-- Uniqueness among ACTIVE (non-soft-deleted) rows, scoped per organization.
create unique index vessels_org_active_name_uidx
  on public.vessels (organization_id, name)
  where deleted_at is null;

create unique index vessels_org_active_imo_uidx
  on public.vessels (organization_id, imo_number)
  where deleted_at is null and imo_number is not null;

create index vessels_organization_id_idx
  on public.vessels (organization_id)
  where deleted_at is null;

create index vessels_client_id_idx
  on public.vessels (client_id)
  where deleted_at is null;

create trigger vessels_set_updated_at
  before update on public.vessels
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.vessels to authenticated;
grant all on public.vessels to service_role;

alter table public.vessels enable row level security;
