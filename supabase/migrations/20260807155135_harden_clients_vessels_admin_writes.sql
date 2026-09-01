create or replace function private.can_manage_operational_data()
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
      and p.role in ('system_admin','organization_admin')
      and p.status = 'active'
      and p.deleted_at is null
  );
$$;

revoke all on function private.can_manage_operational_data() from public;
grant execute on function private.can_manage_operational_data() to authenticated, service_role;

drop policy if exists clients_insert_same_org on public.clients;
create policy clients_insert_same_org
on public.clients
for insert
to authenticated
with check (
  organization_id = (select private.current_organization_id())
  and (select private.can_manage_operational_data())
);

drop policy if exists clients_update_same_org on public.clients;
create policy clients_update_same_org
on public.clients
for update
to authenticated
using (
  organization_id = (select private.current_organization_id())
  and deleted_at is null
  and (select private.can_manage_operational_data())
)
with check (
  organization_id = (select private.current_organization_id())
  and (select private.can_manage_operational_data())
);

drop policy if exists vessels_insert_same_org on public.vessels;
create policy vessels_insert_same_org
on public.vessels
for insert
to authenticated
with check (
  organization_id = (select private.current_organization_id())
  and (select private.can_manage_operational_data())
);

drop policy if exists vessels_update_same_org on public.vessels;
create policy vessels_update_same_org
on public.vessels
for update
to authenticated
using (
  organization_id = (select private.current_organization_id())
  and deleted_at is null
  and (select private.can_manage_operational_data())
)
with check (
  organization_id = (select private.current_organization_id())
  and (select private.can_manage_operational_data())
);
