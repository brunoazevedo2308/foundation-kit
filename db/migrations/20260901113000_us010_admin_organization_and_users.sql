-- DP Suite — US-010 (Administração de Organização e Usuários)
--
-- NÃO APLICADA REMOTAMENTE POR ESTE CICLO. Deve ser aplicada manualmente
-- no projeto `dp-suite-dev` pelo responsável.
--
-- Gaps de segurança tratados:
--   1. `organizations UPDATE` permitia QUALQUER authenticated do tenant.
--   2. `user_vessels INSERT/UPDATE` permitiam QUALQUER authenticated do tenant
--      e não havia caminho de remoção auditável.
--   3. Não existia operação segura para um admin alterar role/status de OUTRO
--      perfil do mesmo tenant (a única policy era `profiles_update_self`).
--   4. Faltava auditoria para organizations e user_vessels.
--
-- Princípios: nenhum bypass genérico de RLS, helpers em `private` com
-- `search_path` fixo, nenhum parâmetro de organization_id vindo do cliente,
-- EXECUTE revogado de public/anon.

-- ============================================================================
-- 1. Helpers de autorização (private)
-- ============================================================================

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

comment on function private.current_app_role() is
  'US-010: role do chamador autenticado, somente se o perfil estiver ativo e não soft-deleted. NULL caso contrário.';

create or replace function private.is_org_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select coalesce(
    private.current_app_role() in ('organization_admin', 'system_admin'),
    false
  )
$$;

comment on function private.is_org_admin() is
  'US-010: true quando o chamador é organization_admin ou system_admin ATIVO.';

revoke all on function private.current_app_role() from public, anon;
revoke all on function private.is_org_admin()     from public, anon;
grant execute on function private.current_app_role() to postgres, service_role;
-- `is_org_admin()` é referenciado por policies avaliadas no contexto do
-- chamador, portanto precisa de EXECUTE para authenticated.
grant execute on function private.is_org_admin() to authenticated, postgres, service_role;

-- ============================================================================
-- 2. organizations — UPDATE apenas por admin do próprio tenant
-- ============================================================================

drop policy if exists "organizations_update_own_org" on public.organizations;

create policy "organizations_update_own_org_admin"
on public.organizations
for update
to authenticated
using (
  id = public.current_organization_id()
  and deleted_at is null
  and private.is_org_admin()
)
with check (
  id = public.current_organization_id()
  and private.is_org_admin()
);

-- ============================================================================
-- 3. user_vessels — INSERT/UPDATE/DELETE apenas por admin do próprio tenant
-- ============================================================================

drop policy if exists "user_vessels_insert_same_org" on public.user_vessels;
drop policy if exists "user_vessels_update_same_org" on public.user_vessels;

create policy "user_vessels_insert_same_org_admin"
on public.user_vessels for insert to authenticated
with check (
  organization_id = public.current_organization_id()
  and private.is_org_admin()
);

create policy "user_vessels_update_same_org_admin"
on public.user_vessels for update to authenticated
using (
  organization_id = public.current_organization_id()
  and private.is_org_admin()
)
with check (
  organization_id = public.current_organization_id()
  and private.is_org_admin()
);

-- `user_vessels` é uma tabela de vínculo sem coluna de soft delete; a
-- desatribuição é o DELETE físico da linha, restrito a admin e auditado.
create policy "user_vessels_delete_same_org_admin"
on public.user_vessels for delete to authenticated
using (
  organization_id = public.current_organization_id()
  and private.is_org_admin()
);

-- ============================================================================
-- 4. RPC segura: admin altera role/status de OUTRO perfil do mesmo tenant
-- ============================================================================

create or replace function public.admin_update_profile_access(
  _profile_id uuid,
  _role       public.app_role,
  _status     public.profile_status
)
returns public.profiles
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor       uuid := auth.uid();
  v_actor_role  public.app_role;
  v_actor_org   uuid;
  v_target      public.profiles;
  v_before      jsonb;
  v_remaining   integer;
begin
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select p.role, p.organization_id
    into v_actor_role, v_actor_org
  from public.profiles p
  where p.id = v_actor
    and p.deleted_at is null
    and p.status = 'active';

  if v_actor_role is null or v_actor_role = 'member' then
    raise exception 'only organization admins can change profile access'
      using errcode = '42501';
  end if;

  if _profile_id = v_actor then
    raise exception 'cannot change your own role or status' using errcode = '42501';
  end if;

  select * into v_target
  from public.profiles
  where id = _profile_id
    and deleted_at is null;

  if v_target.id is null then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;

  -- Isolamento de tenant: nunca confiar em organization_id do cliente.
  if v_actor_org is null or v_target.organization_id is distinct from v_actor_org then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;

  -- Preservação conservadora de system_admin.
  if v_actor_role = 'organization_admin'
     and (v_target.role = 'system_admin' or _role = 'system_admin') then
    raise exception 'organization admins cannot manage system admins'
      using errcode = '42501';
  end if;

  -- Nunca deixar a organização sem nenhum organization_admin ativo.
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

comment on function public.admin_update_profile_access(uuid, public.app_role, public.profile_status) is
  'US-010: única via autorizada para um admin alterar role/status de OUTRO perfil do mesmo tenant. Bloqueia auto-alteração, cross-tenant, escalonamento a system_admin por organization_admin e a remoção do último organization_admin ativo.';

revoke all on function public.admin_update_profile_access(uuid, public.app_role, public.profile_status)
  from public, anon;
grant execute on function public.admin_update_profile_access(uuid, public.app_role, public.profile_status)
  to authenticated;

-- ============================================================================
-- 5. Auditoria — organizations e user_vessels
-- ============================================================================

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
    new.id,
    auth.uid(),
    'organization',
    new.id,
    case
      when old.deleted_at is null and new.deleted_at is not null
        then 'organization.soft_deleted'
      else 'organization.updated'
    end,
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
  v_row public.user_vessels := coalesce(new, old);
begin
  insert into public.audit_events (
    organization_id, actor_user_id, entity_type, entity_id, event_type, event_data
  ) values (
    v_row.organization_id,
    auth.uid(),
    'user_vessel',
    v_row.vessel_id,
    case tg_op
      when 'INSERT' then 'user_vessel.assigned'
      when 'UPDATE' then 'user_vessel.updated'
      else 'user_vessel.unassigned'
    end,
    jsonb_build_object(
      'before', case when old is null then null else to_jsonb(old) end,
      'after',  case when new is null then null else to_jsonb(new) end
    )
  );
  return coalesce(new, old);
end;
$$;

revoke all on function private.audit_user_vessel_change() from public, anon, authenticated;
grant execute on function private.audit_user_vessel_change() to postgres, service_role;

drop trigger if exists trg_user_vessels_audit_change on public.user_vessels;
create trigger trg_user_vessels_audit_change
after insert or update or delete on public.user_vessels
for each row execute function private.audit_user_vessel_change();
