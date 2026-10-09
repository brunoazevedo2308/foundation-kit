-- Enforce tenant integrity even for trusted/server-side writers.
create or replace function private.enforce_data_subject_request_org_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_requester_org_id uuid;
begin
  select organization_id
    into v_requester_org_id
    from public.profiles
   where id = new.requester_user_id
     and deleted_at is null;

  if v_requester_org_id is null or v_requester_org_id <> new.organization_id then
    raise exception 'requester must belong to the request organization'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_data_subject_request_org_integrity()
  from public, anon, authenticated;
grant execute on function private.enforce_data_subject_request_org_integrity()
  to postgres, service_role;

create trigger data_subject_requests_enforce_org_integrity
before insert or update of organization_id, requester_user_id
on public.data_subject_requests
for each row execute function private.enforce_data_subject_request_org_integrity();
