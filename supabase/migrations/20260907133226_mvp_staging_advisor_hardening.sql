-- DP Suite — staging advisor hardening
--
-- Keeps the public API stable while moving privileged organization creation
-- into the non-exposed private schema. It also applies the indexes and RLS
-- initPlan optimizations reported by the Supabase advisors.

-- -----------------------------------------------------------------------------
-- Organization creation: public SECURITY INVOKER facade + private implementation
-- -----------------------------------------------------------------------------
create or replace function private.create_organization(
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
set search_path = pg_catalog, public, private
as $$
declare
  _actor       uuid := auth.uid();
  _organization public.organizations;
  _slug         text;
begin
  if _actor is null or not private.is_system_admin() then
    raise exception 'Only an active System Admin can create an organization'
      using errcode = '42501';
  end if;

  _legal_name       := nullif(btrim(_legal_name), '');
  _display_name     := nullif(btrim(_display_name), '');
  _country_code     := upper(nullif(btrim(_country_code), ''));
  _primary_email    := lower(nullif(btrim(_primary_email), ''));
  _default_language := nullif(btrim(_default_language), '');
  _timezone         := nullif(btrim(_timezone), '');
  _date_format      := nullif(btrim(_date_format), '');

  if _legal_name is null or _display_name is null
    or _country_code is null or _primary_email is null then
    raise exception 'Required organization fields are missing'
      using errcode = '22023';
  end if;
  if _country_code !~ '^[A-Z]{2}$' then
    raise exception 'Invalid country code' using errcode = '22023';
  end if;
  if _primary_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then
    raise exception 'Invalid primary email' using errcode = '22023';
  end if;
  if not exists (select 1 from pg_timezone_names where name = _timezone) then
    raise exception 'Invalid timezone' using errcode = '22023';
  end if;
  if _date_format not in ('DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD') then
    raise exception 'Invalid date format' using errcode = '22023';
  end if;

  _slug := 'org-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);

  insert into public.organizations (
    legal_name, name, slug, country_code, primary_email, status,
    default_language, timezone, date_format
  ) values (
    _legal_name, _display_name, _slug, _country_code, _primary_email, _status,
    _default_language, _timezone, _date_format
  )
  returning * into _organization;

  insert into public.audit_events (
    organization_id, actor_user_id, entity_type, entity_id, event_type, event_data
  ) values (
    _organization.id, _actor, 'organization', _organization.id,
    'organization.created',
    jsonb_build_object(
      'legal_name', _organization.legal_name,
      'display_name', _organization.name,
      'country_code', _organization.country_code,
      'status', _organization.status,
      'default_language', _organization.default_language,
      'timezone', _organization.timezone,
      'date_format', _organization.date_format
    )
  );

  return _organization;
end;
$$;

revoke all on function private.create_organization(
  text, text, text, text, public.organization_status, text, text, text
) from public, anon;
grant execute on function private.create_organization(
  text, text, text, text, public.organization_status, text, text, text
) to authenticated, service_role;

create or replace function public.create_organization(
  _legal_name       text,
  _display_name     text,
  _country_code     text,
  _primary_email    text,
  _status           public.organization_status default 'active',
  _default_language text default 'pt-BR',
  _timezone         text default 'America/Sao_Paulo',
  _date_format      text default 'DD/MM/YYYY'
)
returns public.organizations
language sql
security invoker
set search_path = pg_catalog, public, private
as $$
  select private.create_organization(
    _legal_name, _display_name, _country_code, _primary_email, _status,
    _default_language, _timezone, _date_format
  );
$$;

revoke all on function public.create_organization(
  text, text, text, text, public.organization_status, text, text, text
) from public, anon;
grant execute on function public.create_organization(
  text, text, text, text, public.organization_status, text, text, text
) to authenticated;

comment on function public.create_organization(
  text, text, text, text, public.organization_status, text, text, text
) is 'Creates an organization through a SECURITY INVOKER facade; authorization and privileged writes are isolated in private.create_organization.';

-- -----------------------------------------------------------------------------
-- Foreign-key indexes reported by the performance advisor
-- -----------------------------------------------------------------------------
create index if not exists actions_created_by_idx
  on public.actions (created_by);
create index if not exists deliverables_created_by_idx
  on public.deliverables (created_by);
create index if not exists notifications_actor_user_id_idx
  on public.notifications (actor_user_id);
create index if not exists user_vessels_assigned_by_idx
  on public.user_vessels (assigned_by);

-- -----------------------------------------------------------------------------
-- RLS initPlan optimizations. These helpers are stable for the whole statement,
-- so SELECT wrappers let Postgres evaluate them once instead of once per row.
-- -----------------------------------------------------------------------------
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self
on public.profiles for update to authenticated
using (
  id = (select auth.uid())
  and organization_id = (select private.current_organization_id())
  and deleted_at is null
)
with check (
  id = (select auth.uid())
  and organization_id = (select private.current_organization_id())
);

drop policy if exists evidences_insert_authorized_deliverable on public.evidences;
create policy evidences_insert_authorized_deliverable
on public.evidences for insert to authenticated
with check (
  organization_id = (select private.current_organization_id())
  and (select private.can_manage_operational_data())
  and uploaded_by = (select auth.uid())
  and exists (
    select 1
    from public.deliverables d
    join public.actions a on a.id = d.action_id
    where d.id = evidences.deliverable_id
      and d.organization_id = evidences.organization_id
      and d.deleted_at is null
      and a.organization_id = evidences.organization_id
      and a.deleted_at is null
  )
);

drop policy if exists attachments_insert_same_org on public.attachments;
create policy attachments_insert_same_org
on public.attachments for insert to authenticated
with check (
  organization_id = (select private.current_organization_id())
  and (select private.can_manage_operational_data())
  and uploaded_by = (select auth.uid())
);

drop policy if exists notifications_select_own_recipient on public.notifications;
create policy notifications_select_own_recipient
on public.notifications for select to authenticated
using (
  organization_id = (select private.current_organization_id())
  and recipient_user_id = (select auth.uid())
);

drop policy if exists notifications_update_recipient_only on public.notifications;
create policy notifications_update_recipient_only
on public.notifications for update to authenticated
using (
  organization_id = (select private.current_organization_id())
  and recipient_user_id = (select auth.uid())
)
with check (
  organization_id = (select private.current_organization_id())
  and recipient_user_id = (select auth.uid())
);

drop policy if exists user_vessels_insert_same_org_admin on public.user_vessels;
create policy user_vessels_insert_same_org_admin
on public.user_vessels for insert to authenticated
with check (
  organization_id = (select private.current_organization_id())
  and assigned_by = (select auth.uid())
  and (select private.is_org_admin())
  and exists (
    select 1
    from public.profiles p
    where p.id = user_vessels.profile_id
      and p.organization_id = (select private.current_organization_id())
      and p.deleted_at is null
  )
  and exists (
    select 1
    from public.vessels v
    where v.id = user_vessels.vessel_id
      and v.organization_id = (select private.current_organization_id())
      and v.deleted_at is null
  )
);
