-- US-005 — listagem global de organizações para System Admin.
--
-- A RLS de `organizations` continua limitando usuários comuns ao próprio
-- tenant. Esta RPC atravessa esse recorte somente após validar o papel ativo
-- do chamador com o helper SECURITY DEFINER endurecido.

create or replace function public.list_organizations()
returns setof public.organizations
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if not private.is_system_admin() then
    raise exception using
      errcode = '42501',
      message = 'Only an active System Admin can list organizations';
  end if;

  return query
  select o.*
  from public.organizations o
  where o.deleted_at is null
  order by o.name asc, o.created_at asc;
end;
$$;

revoke all on function public.list_organizations() from public;
revoke all on function public.list_organizations() from anon;
grant execute on function public.list_organizations() to authenticated;
grant execute on function public.list_organizations() to service_role;
