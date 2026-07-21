-- DP Suite — US-005 (versioning-only mirror of remote state)
--
-- This migration reflects EXACTLY the state already applied on the remote
-- Supabase project `dp-suite-dev`. It is idempotent and safe to re-run;
-- however it must NOT be applied against the remote (which is already in
-- the target state). It exists to keep the repository migration history
-- aligned with the database.
--
-- Scope:
--   * `public.app_role` enum with values (system_admin, organization_admin, member).
--   * `public.profiles.role` column (default 'member').
--   * `public.organization_status` enum (active, inactive) — the initial
--     lifecycle values approved for US-005.
--   * Extend `public.organizations` with the fields required by US-005:
--     legal_name, country_code (ISO-3166 alpha-2), primary_email, status,
--     default_language, timezone, date_format. The existing `name` column
--     keeps its role as the human display name.
--   * `public.create_organization(...)` — SECURITY DEFINER RPC that only
--     an active `system_admin` may execute. Validates inputs, normalizes
--     text, enforces uniqueness on lower(legal_name), inserts the row and
--     returns the new organization id.
--
-- Non-goals: no data changes, no changes to RLS policies, no membership
-- model, no seed data.

-- -----------------------------------------------------------------------------
-- Enum: app_role
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('system_admin', 'organization_admin', 'member');
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- Enum: organization_status
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'organization_status') then
    create type public.organization_status as enum ('active', 'inactive');
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- profiles.role
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists role public.app_role not null default 'member';

comment on column public.profiles.role is
  'Application role. system_admin > organization_admin > member. Used by UI and RPCs to gate administrative flows (e.g. public.create_organization).';

-- -----------------------------------------------------------------------------
-- organizations — US-005 fields
-- -----------------------------------------------------------------------------
alter table public.organizations
  add column if not exists legal_name       text,
  add column if not exists country_code     char(2),
  add column if not exists primary_email    text,
  add column if not exists status           public.organization_status not null default 'active',
  add column if not exists default_language text not null default 'pt-BR',
  add column if not exists timezone         text not null default 'America/Sao_Paulo',
  add column if not exists date_format      text not null default 'DD/MM/YYYY';

comment on column public.organizations.legal_name       is 'Razão social (nome jurídico oficial).';
comment on column public.organizations.name             is 'Nome de exibição (fantasia) apresentado na UI.';
comment on column public.organizations.country_code     is 'País da sede em ISO-3166 alpha-2 (ex: BR, US).';
comment on column public.organizations.primary_email    is 'E-mail institucional principal para comunicação.';
comment on column public.organizations.status           is 'Ciclo de vida da organização (active | inactive).';
comment on column public.organizations.default_language is 'Idioma padrão (tag BCP-47, ex: pt-BR).';
comment on column public.organizations.timezone         is 'Fuso horário IANA (ex: America/Sao_Paulo).';
comment on column public.organizations.date_format      is 'Formato de data padrão para a UI (ex: DD/MM/YYYY).';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'organizations_country_code_iso2_chk'
  ) then
    alter table public.organizations
      add constraint organizations_country_code_iso2_chk
      check (country_code is null or country_code ~ '^[A-Z]{2}$');
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'organizations_primary_email_chk'
  ) then
    alter table public.organizations
      add constraint organizations_primary_email_chk
      check (primary_email is null or primary_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');
  end if;
end
$$;

create unique index if not exists organizations_legal_name_ci_uidx
  on public.organizations (lower(legal_name))
  where deleted_at is null and legal_name is not null;

-- -----------------------------------------------------------------------------
-- RPC: public.create_organization
--
-- SECURITY DEFINER: bypasses RLS to insert into public.organizations, but
-- gates execution by requiring an active caller with role = 'system_admin'.
-- Any other caller receives SQLSTATE 42501.
-- -----------------------------------------------------------------------------
create or replace function public.create_organization(
  _country_code     text,
  _date_format      text,
  _default_language text,
  _display_name     text,
  _legal_name       text,
  _primary_email    text,
  _status           public.organization_status,
  _timezone         text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  _uid    uuid := auth.uid();
  _role   public.app_role;
  _pstat  public.profile_status;
  _id     uuid;
  _slug   text;
begin
  if _uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select role, status
    into _role, _pstat
  from public.profiles
  where id = _uid;

  if _role is null or _pstat is distinct from 'active' or _role <> 'system_admin' then
    raise exception 'Only an active System Admin can create an organization'
      using errcode = '42501';
  end if;

  -- Normalize inputs
  _legal_name       := btrim(coalesce(_legal_name, ''));
  _display_name     := btrim(coalesce(_display_name, ''));
  _country_code     := upper(btrim(coalesce(_country_code, '')));
  _primary_email    := lower(btrim(coalesce(_primary_email, '')));
  _default_language := btrim(coalesce(_default_language, 'pt-BR'));
  _timezone         := btrim(coalesce(_timezone, 'America/Sao_Paulo'));
  _date_format      := btrim(coalesce(_date_format, 'DD/MM/YYYY'));

  if length(_legal_name) = 0 then
    raise exception 'legal_name is required' using errcode = '23514';
  end if;
  if length(_display_name) = 0 then
    raise exception 'display_name is required' using errcode = '23514';
  end if;
  if _country_code !~ '^[A-Z]{2}$' then
    raise exception 'country_code must be ISO-3166 alpha-2' using errcode = '23514';
  end if;
  if _primary_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'primary_email is invalid' using errcode = '23514';
  end if;

  -- Slug derived from display name (best-effort; unique index on organizations.slug).
  _slug := regexp_replace(lower(_display_name), '[^a-z0-9]+', '-', 'g');
  _slug := btrim(_slug, '-');
  if length(_slug) = 0 then
    _slug := 'org-' || substr(gen_random_uuid()::text, 1, 8);
  else
    _slug := _slug || '-' || substr(gen_random_uuid()::text, 1, 8);
  end if;

  insert into public.organizations(
    name, slug, legal_name, country_code, primary_email,
    status, default_language, timezone, date_format
  )
  values (
    _display_name, _slug, _legal_name, _country_code, _primary_email,
    _status, _default_language, _timezone, _date_format
  )
  returning id into _id;

  return _id;
end;
$$;

comment on function public.create_organization(
  text, text, text, text, text, text, public.organization_status, text
) is
  'US-005: creates an Organization. SECURITY DEFINER — only an active system_admin may execute. Enforces validation, uniqueness on lower(legal_name) and returns the new id.';

revoke all on function public.create_organization(
  text, text, text, text, text, text, public.organization_status, text
) from public;
revoke all on function public.create_organization(
  text, text, text, text, text, text, public.organization_status, text
) from anon;
grant execute on function public.create_organization(
  text, text, text, text, text, text, public.organization_status, text
) to authenticated;
