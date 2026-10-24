create or replace function private.enforce_client_contact_org_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  client_org uuid;
begin
  select organization_id
    into client_org
    from public.clients
   where id = new.client_id
     and deleted_at is null;

  perform public.assert_same_org(new.organization_id, client_org, 'client_contact.client_id');
  return new;
end;
$$;

revoke all on function private.enforce_client_contact_org_integrity()
  from public, anon, authenticated;
grant execute on function private.enforce_client_contact_org_integrity()
  to postgres, service_role;
