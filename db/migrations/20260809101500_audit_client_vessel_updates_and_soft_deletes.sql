create or replace function private.audit_client_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  insert into public.audit_events (
    organization_id,
    actor_user_id,
    entity_type,
    entity_id,
    event_type,
    event_data
  ) values (
    old.organization_id,
    auth.uid(),
    'client',
    old.id,
    case when old.deleted_at is null and new.deleted_at is not null then 'client.soft_deleted' else 'client.updated' end,
    jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new))
  );
  return new;
end;
$$;

revoke all on function private.audit_client_change() from public, anon, authenticated;
grant execute on function private.audit_client_change() to postgres, service_role;

drop trigger if exists trg_clients_audit_change on public.clients;
create trigger trg_clients_audit_change
after update on public.clients
for each row execute function private.audit_client_change();

create or replace function private.audit_vessel_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  insert into public.audit_events (
    organization_id,
    actor_user_id,
    entity_type,
    entity_id,
    event_type,
    event_data
  ) values (
    old.organization_id,
    auth.uid(),
    'vessel',
    old.id,
    case when old.deleted_at is null and new.deleted_at is not null then 'vessel.soft_deleted' else 'vessel.updated' end,
    jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new))
  );
  return new;
end;
$$;

revoke all on function private.audit_vessel_change() from public, anon, authenticated;
grant execute on function private.audit_vessel_change() to postgres, service_role;

drop trigger if exists trg_vessels_audit_change on public.vessels;
create trigger trg_vessels_audit_change
after update on public.vessels
for each row execute function private.audit_vessel_change();
