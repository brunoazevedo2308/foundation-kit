-- DP Suite — LGPD foundation: auditable data-subject request workflow.
-- Requests are intentionally not executed automatically. Identity, legal basis,
-- retention duties and third-party data must be reviewed before fulfilment.

create table public.data_subject_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  requester_user_id uuid not null references public.profiles(id) on delete restrict,
  request_type text not null check (
    request_type in (
      'access', 'correction', 'deletion', 'portability', 'opposition',
      'review', 'consent_revocation', 'other'
    )
  ),
  details text not null check (char_length(btrim(details)) between 10 and 4000),
  status text not null default 'open' check (
    status in ('open', 'in_review', 'waiting_for_requester', 'completed', 'rejected', 'cancelled')
  ),
  response_summary text null check (
    response_summary is null or char_length(response_summary) <= 4000
  ),
  resolved_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint data_subject_requests_resolution_consistency check (
    (status in ('completed', 'rejected', 'cancelled') and resolved_at is not null)
    or
    (status in ('open', 'in_review', 'waiting_for_requester') and resolved_at is null)
  )
);

comment on table public.data_subject_requests is
  'Auditable LGPD data-subject requests. Fulfilment remains a reviewed administrative process; no automatic deletion.';
comment on column public.data_subject_requests.details is
  'Request description supplied by the authenticated data subject. Do not copy this field into audit_events.';

create index data_subject_requests_org_created_idx
  on public.data_subject_requests (organization_id, created_at desc);
create index data_subject_requests_requester_created_idx
  on public.data_subject_requests (requester_user_id, created_at desc);

create trigger data_subject_requests_set_updated_at
before update on public.data_subject_requests
for each row execute function public.set_updated_at();

alter table public.data_subject_requests enable row level security;

create policy "data_subject_requests_select_authorized"
on public.data_subject_requests for select to authenticated
using (
  organization_id = (select private.current_organization_id())
  and (
    requester_user_id = (select auth.uid())
    or (select private.is_org_admin())
  )
);

create policy "data_subject_requests_insert_own"
on public.data_subject_requests for insert to authenticated
with check (
  organization_id = (select private.current_organization_id())
  and requester_user_id = (select auth.uid())
  and status = 'open'
  and response_summary is null
  and resolved_at is null
);

create policy "data_subject_requests_update_org_admin"
on public.data_subject_requests for update to authenticated
using (
  organization_id = (select private.current_organization_id())
  and (select private.is_org_admin())
)
with check (
  organization_id = (select private.current_organization_id())
  and (select private.is_org_admin())
);

revoke all on table public.data_subject_requests from public, anon, authenticated;
grant select on table public.data_subject_requests to authenticated;
grant insert (organization_id, requester_user_id, request_type, details)
  on table public.data_subject_requests to authenticated;
grant update (status, response_summary, resolved_at)
  on table public.data_subject_requests to authenticated;
grant all on table public.data_subject_requests to service_role;

create or replace function private.audit_data_subject_request_change()
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
    new.organization_id,
    auth.uid(),
    'data_subject_request',
    new.id,
    case when tg_op = 'INSERT' then 'data_subject_request.created'
         else 'data_subject_request.status_changed' end,
    case when tg_op = 'INSERT'
      then jsonb_build_object('request_type', new.request_type, 'status', new.status)
      else jsonb_build_object(
        'request_type', new.request_type,
        'previous_status', old.status,
        'status', new.status
      )
    end
  );
  return new;
end;
$$;

revoke all on function private.audit_data_subject_request_change()
  from public, anon, authenticated;
grant execute on function private.audit_data_subject_request_change()
  to postgres, service_role;

create trigger trg_data_subject_requests_audit_insert
after insert on public.data_subject_requests
for each row execute function private.audit_data_subject_request_change();

create trigger trg_data_subject_requests_audit_status
after update of status on public.data_subject_requests
for each row
when (old.status is distinct from new.status)
execute function private.audit_data_subject_request_change();
