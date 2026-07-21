-- DP Suite — US-005 (versioning-only mirror of remote state)
--
-- This migration reflects EXACTLY the state already applied on the remote
-- Supabase project `dp-suite-dev`. It is idempotent and safe to re-run;
-- however it must NOT be applied against the remote (which is already in
-- the target state). It exists to keep the repository migration history
-- aligned with the database.
--
-- Scope:
--   * `public.app_role` enum (system_admin, organization_admin, member).
--   * `public.profiles.role` column (default 'member').
--   * `public.organization_status` enum (active, inactive).
--   * Extend `public.organizations` with the US-005 fields, matching the
--     remote types exactly:
--       legal_name       text NOT NULL,
--       country_code     text NOT NULL (ISO-3166 alpha-2, uppercase),
--       primary_email    text NOT NULL,
--       status           organization_status NOT NULL default 'active',
--       default_language text NOT NULL default 'pt-BR',
--       timezone         text NOT NULL default 'America/Sao_Paulo',
--       date_format      text NOT NULL default 'DD/MM/YYYY'.
--     The existing `name` column keeps its role as the human display name.
--   * `private.is_system_admin()` — SECURITY DEFINER helper with
--     `search_path = pg_catalog, public, private`.
--   * `public.create_organization(_legal_name, _display_name,
--     _country_code, _primary_email, _status, _default_language,
--     _timezone, _date_format)` — SECURITY DEFINER RPC returning a single
--     `public.organizations` composite row (NOT SETOF). Generates a slug
--     `org-<12 hex chars>` and writes the `organization.created` audit
--     event itself using the real audit_events columns
--     (organization_id, actor_user_id, entity_type, entity_id, event_type,
--      event_data).
--   * Hardened privileges: EXECUTE granted only to `authenticated`;
--     revoked from `public` and `anon` (mirrored here in the same file;
--     on the remote this hardening was applied in a separate migration).
--
-- Non-goals: no unique index on legal_name in this delivery, no data
-- changes, no changes to RLS policies for organizations, no seeds.

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('system_admin', 'organization_admin', 'member');
  end if;
end
$$;

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
--
-- The remote types for these columns are `text NOT NULL` (backfilled prior
-- to the NOT NULL toggle). We add them as nullable, then flip NOT NULL and
-- drop the defaults where the remote no longer keeps them, guarded by
-- pg_attribute so the script stays idempotent.
-- -----------------------------------------------------------------------------
alter table public.organizations
  add column if not exists legal_name       text,
  add column if not exists country_code     text,
  add column if not exists primary_email    text,
  add column if not exists status           public.organization_status not null default 'active',
  add column if not exists default_language text not null default 'pt-BR',
  add column if not exists timezone         text not null default 'America/Sao_Paulo',
  add column if not exists date_format      text not null default 'DD/MM/YYYY';

do $$
begin
  if exists (
    select 1
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'organizations'
      and a.attname = 'legal_name' and a.attnotnull = false
  ) then
    alter table public.organizations alter column legal_name set not null;
  end if;
  if exists (
    select 1
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'organizations'
      and a.attname = 'country_code' and a.attnotnull = false
  ) then
    alter table public.organizations alter column country_code set not null;
  end if;
  if exists (
    select 1
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'organizations'
      and a.attname = 'primary_email' and a.attnotnull = false
  ) then
    alter table public.organizations alter column primary_email set not null;
  end if;
end
$$;

comment on column public.organizations.legal_name       is 'Razão social (nome jurídico oficial).';
comment on column public.organizations.name             is 'Nome de exibição (fantasia) apresentado na UI.';
comment on column public.organizations.country_code     is 'País da sede em ISO-3166 alpha-2 (ex: BR, US).';
comment on column public.organizations.primary_email    is 'E-mail institucional principal para comunicação.';
comment on column public.organizations.status           is 'Ciclo de vida da organização (active | inactive).';
comment on column public.organizations.default_language is 'Idioma padrão (tag BCP-47, ex: pt-BR).';
comment on column public.organizations.timezone         is 'Fuso horário IANA (ex: America/Sao_Paulo).';
comment on column public.organizations.date_format      is 'Formato de data padrão para a UI (ex: DD/MM/YYYY).';

-- Real CHECK constraints present on the remote.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'organizations_country_code_iso2_chk'
  ) then
    alter table public.organizations
      add constraint organizations_country_code_iso2_chk
      check (country_code ~ '^[A-Z]{2}$');
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'organizations_primary_email_chk'
  ) then
    alter table public.organizations
      add constraint organizations_primary_email_chk
      check (primary_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'organizations_default_language_chk'
  ) then
    alter table public.organizations
      add constraint organizations_default_language_chk
      check (default_language ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$');
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'organizations_date_format_chk'
  ) then
    alter table public.organizations
      add constraint organizations_date_format_chk
      check (date_format in ('DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'));
  end if;
end
$$;

-- NOTE: No unique index on lower(legal_name) is present on the remote in
-- this delivery. Duplicate detection is intentionally NOT enforced here.

-- -----------------------------------------------------------------------------
-- Helper: private.is_system_admin()
-- -----------------------------------------------------------------------------
create schema if not exists private;

create or replace function private.is_system_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.deleted_at is null
      and p.status = 'active'
      and p.role   = 'system_admin'
  );
$$;

comment on function private.is_system_admin() is
  'True only when auth.uid() is an ACTIVE system_admin profile. SECURITY DEFINER helper for RPCs.';

revoke all on function private.is_system_admin() from public;
revoke all on function private.is_system_admin() from anon;
grant execute on function private.is_system_admin() to authenticated;

-- -----------------------------------------------------------------------------
-- RPC: public.create_organization
--
-- Signature and column order MUST match the remote exactly:
--   (_legal_name, _display_name, _country_code, _primary_email,
--    _status, _default_language, _timezone, _date_format)
-- Returns a single `public.organizations` composite row (NOT SETOF).
-- -----------------------------------------------------------------------------
-- Drop any pre-existing overload so this script is safe to re-run and
-- guarantees only the canonical signature survives.
drop function if exists public.create_organization(
  text, text, text, text, public.organization_status, text, text, text
);

create or replace function public.create_organization(
  _legal_name       text,
  _display_name     text,
  _country_code     text,
  _primary_email    text,
  _status           public.organization_status,
  _default_language text,
  _timezone         text,
  _date_format      text
)
returns public.organizations
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  _uid          uuid := auth.uid();
  _slug         text;
  _organization public.organizations;
begin
  if _uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  if not private.is_system_admin() then
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

  -- Slug canônico: prefixo "org-" + 12 caracteres hex de gen_random_uuid().
  _slug := 'org-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);

  insert into public.organizations(
    name, slug, legal_name, country_code, primary_email,
    status, default_language, timezone, date_format
  )
  values (
    _display_name, _slug, _legal_name, _country_code, _primary_email,
    _status, _default_language, _timezone, _date_format
  )
  returning * into _organization;

  -- Audit trail is written by the RPC itself (no trigger for this action).
  -- Uses the real audit_events columns present on the remote:
  --   organization_id, actor_user_id, entity_type, entity_id, event_type, event_data
  insert into public.audit_events(
    organization_id, actor_user_id, entity_type, entity_id, event_type, event_data
  )
  values (
    _organization.id,
    _uid,
    'organization',
    _organization.id,
    'organization.created',
    jsonb_build_object(
      'legal_name',       _organization.legal_name,
      'display_name',     _organization.name,
      'country_code',     _organization.country_code,
      'status',           _organization.status,
      'default_language', _organization.default_language,
      'timezone',         _organization.timezone,
      'date_format',      _organization.date_format
    )
  );

  return _organization;
end;
$$;

comment on function public.create_organization(
  text, text, text, text, public.organization_status, text, text, text
) is
  'US-005: creates an Organization. SECURITY DEFINER — only an active system_admin may execute. Writes its own organization.created audit event and returns the new row.';

-- -----------------------------------------------------------------------------
-- Hardening: authenticated-only EXECUTE. Anon/public revoked.
-- On the remote this was applied as a separate migration; mirrored here so
-- the local repo remains a faithful representation of the current state.
-- -----------------------------------------------------------------------------
revoke all on function public.create_organization(
  text, text, text, text, public.organization_status, text, text, text
) from public;
revoke all on function public.create_organization(
  text, text, text, text, public.organization_status, text, text, text
) from anon;
grant execute on function public.create_organization(
  text, text, text, text, public.organization_status, text, text, text
) to authenticated;
