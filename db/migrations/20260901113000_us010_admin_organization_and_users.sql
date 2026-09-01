-- DP Suite — US-010 (Administração de Organização e Usuários)
-- Backend/RBAC hardening. Aplicar via Supabase migration.

-- 1) Helpers de autorização
create or replace function private.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid()
    and p.deleted_at is null
    and p.status = 'active'
$$;

create or replace function private.is_org_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select coalesce(private.current_app_role() in ('organization_admin', 'system_admin'), false)
$$;

revoke all on function private.current_app_role() from public, anon, authenticated;
revoke all on function private.is_org_admin() from public, anon;
grant execute on function private.current_app_role() to postgres, service_role;
grant execute on function private.is_org_admin() to authenticated, postgres, service_role;

-- 2) Organização: remover UPDATE direto amplo e expor somente operação segura
revoke update on public.organizations from authenticated;
drop policy if exists "organizations_update_own_org" on public.organizations;
drop policy if exists "organizations_update_own_org_admin" on public.organizations;

create or replace function private.admin_update_organization_settings(
  _name text,
  _legal_name text,
  _primary_email text,
  _default_language text,
  _timezone text,
  _date_format text
)
returns public.organizations
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_org_id uuid := private.current_organization_id();
  v_row public.organizations;
begin
  if auth.uid() is null or not private.is_org_admin() or v_org_id is null then
    raise exception 'admin access required' using errcode = '42501';
  end if;

  if nullif(btrim(_name), '') is null
     or nullif(btrim(_legal_name), '') is null
     or nullif(btrim(_primary_email), '') is null
     or nullif(btrim(_default_language), '') is null
     or nullif(btrim(_timezone), '') is null
     or nullif(btrim(_date_format), '') is null then
    raise exception 'required organization settings cannot be empty' using errcode = '23514';
  end if;

  update public.organizations
     set name = btrim(_name),
         legal_name = btrim(_legal_name),
         primary_email = lower(btrim(_primary_email)),
         default_language = btrim(_default_language),
         timezone = btrim(_timezone),
         date_format = btrim(_date_format)
   where id = v_org_id
     and deleted_at is null
  returning * into v_row;

  if v_row.id is null then
    raise exception 'organization not found' using errcode = 'P0002';
  end if;

  return v_row;
end;
$$;

revoke all on function private.admin_update_organization_settings(text,text,text,text,text,text)
  from public, anon;
grant execute on function private.admin_update_organization_settings(text,text,text,text,text,text)
  to authenticated;

create or replace function public.admin_update_organization_settings(
  _name text,
  _legal_name text,
  _primary_email text,
  _default_language text,
  _timezone text,
  _date_format text
)
returns public.organizations
language sql
security invoker
set search_path = pg_catalog, public, private
as $$
  select private.admin_update_organization_settings(
    _name, _legal_name, _primary_email, _default_language, _timezone, _date_format
  )
$$;

revoke all on function public.admin_update_organization_settings(text,text,text,text,text,text)
  from public, anon;
grant execute on function public.admin_update_organization_settings(text,text,text,text,text,text)
  to authenticated;

-- 3) Perfis: operação segura de role/status para OUTRO usuário do mesmo tenant
create or replace function private.admin_update_profile_access(
  _profile_id uuid,
  _role public.app_role,
  _status public.profile_status
)
returns public.profiles
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_role public.app_role;
  v_actor_org uuid := private.current_organization_id();
  v_target public.profiles;
  v_before jsonb;
  v_remaining integer;
begin
  if v_actor is null or v_actor_org is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select p.role into v_actor_role
  from public.profiles p
  where p.id = v_actor
    and p.organization_id = v_actor_org
    and p.deleted_at is null
    and p.status = 'active';

  if v_actor_role is null or v_actor_role = 'member' then
    raise exception 'admin access required' using errcode = '42501';
  end if;

  if _profile_id = v_actor then
    raise exception 'cannot change your own role or status' using errcode = '42501';
  end if;

  select * into v_target
  from public.profiles p
  where p.id = _profile_id
    and p.organization_id = v_actor_org
    and p.deleted_at is null;

  if v_target.id is null then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;

  if v_actor_role = 'organization_admin'
     and (v_target.role = 'system_admin' or _role = 'system_admin') then
    raise exception 'organization admins cannot manage system admins' using errcode = '42501';
  end if;

  if v_target.role = 'organization_admin' and v_target.status = 'active'
     and (_role <> 'organization_admin' or _status <> 'active') then
    select count(*) into v_remaining
    from public.profiles p
    where p.organization_id = v_actor_org
      and p.deleted_at is null
      and p.status = 'active'
      and p.role = 'organization_admin'
      and p.id <> _profile_id;

    if v_remaining = 0 then
      raise exception 'organization must keep at least one active organization admin'
        using errcode = '23514';
    end if;
  end if;

  v_before := to_jsonb(v_target);

  update public.profiles
     set role = _role,
         status = _status
   where id = _profile_id
  returning * into v_target;

  insert into public.audit_events (
    organization_id, actor_user_id, entity_type, entity_id, event_type, event_data
  ) values (
    v_actor_org, v_actor, 'profile', _profile_id, 'profile.access_changed',
    jsonb_build_object('before', v_before, 'after', to_jsonb(v_target))
  );

  return v_target;
end;
$$;

revoke all on function private.admin_update_profile_access(uuid, public.app_role, public.profile_status)
  from public, anon;
grant execute on function private.admin_update_profile_access(uuid, public.app_role, public.profile_status)
  to authenticated;

create or replace function public.admin_update_profile_access(
  _profile_id uuid,
  _role public.app_role,
  _status public.profile_status
)
returns public.profiles
language sql
security invoker
set search_path = pg_catalog, public, private
as $$
  select private.admin_update_profile_access(_profile_id, _role, _status)
$$;

revoke all on function public.admin_update_profile_access(uuid, public.app_role, public.profile_status)
  from public, anon;
grant execute on function public.admin_update_profile_access(uuid, public.app_role, public.profile_status)
  to authenticated;

-- 4) user_vessels: somente admin pode atribuir/desatribuir. UPDATE não é necessário;
-- para mudar um vínculo, remover e inserir um novo vínculo.
drop policy if exists "user_vessels_insert_same_org" on public.user_vessels;
drop policy if exists "user_vessels_update_same_org" on public.user_vessels;
drop policy if exists "user_vessels_insert_same_org_admin" on public.user_vessels;
drop policy if exists "user_vessels_update_same_org_admin" on public.user_vessels;
drop policy if exists "user_vessels_delete_same_org_admin" on public.user_vessels;

revoke update on public.user_vessels from authenticated;
grant select, insert, delete on public.user_vessels to authenticated;

create policy "user_vessels_insert_same_org_admin"
on public.user_vessels for insert to authenticated
with check (
  organization_id = private.current_organization_id()
  and assigned_by = auth.uid()
  and private.is_org_admin()
  and exists (
    select 1 from public.profiles p
    where p.id = profile_id
      and p.organization_id = private.current_organization_id()
      and p.deleted_at is null
  )
  and exists (
    select 1 from public.vessels v
    where v.id = vessel_id
      and v.organization_id = private.current_organization_id()
      and v.deleted_at is null
  )
);

create policy "user_vessels_delete_same_org_admin"
on public.user_vessels for delete to authenticated
using (
  organization_id = private.current_organization_id()
  and private.is_org_admin()
);

-- 5) Auditoria de organização e vínculos
create or replace function private.audit_organization_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  insert into public.audit_events (
    organization_id, actor_user_id, entity_type, entity_id, event_type, event_data
  ) values (
    new.id, auth.uid(), 'organization', new.id, 'organization.updated',
    jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new))
  );
  return new;
end;
$$;

revoke all on function private.audit_organization_change() from public, anon, authenticated;
grant execute on function private.audit_organization_change() to postgres, service_role;

drop trigger if exists trg_organizations_audit_change on public.organizations;
create trigger trg_organizations_audit_change
after update on public.organizations
for each row execute function private.audit_organization_change();

create or replace function private.audit_user_vessel_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_org uuid := case when tg_op = 'DELETE' then old.organization_id else new.organization_id end;
  v_vessel uuid := case when tg_op = 'DELETE' then old.vessel_id else new.vessel_id end;
begin
  insert into public.audit_events (
    organization_id, actor_user_id, entity_type, entity_id, event_type, event_data
  ) values (
    v_org,
    auth.uid(),
    'user_vessel',
    v_vessel,
    case when tg_op = 'INSERT' then 'user_vessel.assigned' else 'user_vessel.unassigned' end,
    jsonb_build_object(
      'before', case when tg_op = 'DELETE' then to_jsonb(old) else null end,
      'after', case when tg_op = 'INSERT' then to_jsonb(new) else null end
    )
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function private.audit_user_vessel_change() from public, anon, authenticated;
grant execute on function private.audit_user_vessel_change() to postgres, service_role;

drop trigger if exists trg_user_vessels_audit_change on public.user_vessels;
create trigger trg_user_vessels_audit_change
after insert or delete on public.user_vessels
for each row execute function private.audit_user_vessel_change();
