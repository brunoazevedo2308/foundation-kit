create table public.client_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  client_id uuid not null
    references public.clients(id) on delete cascade,
  email text,
  phone text,
  responsible_area text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_contacts_email_length_check
    check (email is null or char_length(email) <= 254),
  constraint client_contacts_phone_length_check
    check (phone is null or char_length(phone) <= 40),
  constraint client_contacts_responsible_area_length_check
    check (responsible_area is null or char_length(responsible_area) <= 120),
  constraint client_contacts_has_contact_check
    check (email is not null or phone is not null),
  constraint client_contacts_position_check
    check (position >= 0)
);

comment on table public.client_contacts is
  'Multiple e-mail and phone contacts associated with a client, isolated by organization.';
comment on column public.client_contacts.responsible_area is
  'Department or business area responsible for this client contact.';

create index client_contacts_client_position_idx
  on public.client_contacts (client_id, position, created_at);
create index client_contacts_organization_id_idx
  on public.client_contacts (organization_id);

create trigger client_contacts_set_updated_at
before update on public.client_contacts
for each row execute function public.set_updated_at();

create or replace function private.enforce_client_contact_org_integrity()
returns trigger
language plpgsql
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

create trigger client_contacts_enforce_org_integrity
before insert or update on public.client_contacts
for each row execute function private.enforce_client_contact_org_integrity();

alter table public.client_contacts enable row level security;

create policy client_contacts_select_same_org
on public.client_contacts
for select
to authenticated
using (
  organization_id = (select private.current_organization_id())
  and exists (
    select 1
    from public.clients c
    where c.id = client_id
      and c.organization_id = (select private.current_organization_id())
      and c.deleted_at is null
  )
);

create policy client_contacts_insert_same_org_admin
on public.client_contacts
for insert
to authenticated
with check (
  organization_id = (select private.current_organization_id())
  and (select private.can_manage_operational_data())
  and exists (
    select 1
    from public.clients c
    where c.id = client_id
      and c.organization_id = (select private.current_organization_id())
      and c.deleted_at is null
  )
);

create policy client_contacts_update_same_org_admin
on public.client_contacts
for update
to authenticated
using (
  organization_id = (select private.current_organization_id())
  and (select private.can_manage_operational_data())
)
with check (
  organization_id = (select private.current_organization_id())
  and (select private.can_manage_operational_data())
  and exists (
    select 1
    from public.clients c
    where c.id = client_id
      and c.organization_id = (select private.current_organization_id())
      and c.deleted_at is null
  )
);

create policy client_contacts_delete_same_org_admin
on public.client_contacts
for delete
to authenticated
using (
  organization_id = (select private.current_organization_id())
  and (select private.can_manage_operational_data())
);

grant select, insert, update, delete on public.client_contacts to authenticated;
grant all on public.client_contacts to service_role;

create or replace function private.audit_client_contact_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  row_data public.client_contacts;
begin
  row_data := case when tg_op = 'DELETE' then old else new end;

  insert into public.audit_events (
    organization_id,
    actor_user_id,
    entity_type,
    entity_id,
    event_type,
    event_data
  ) values (
    row_data.organization_id,
    auth.uid(),
    'client',
    row_data.client_id,
    case tg_op
      when 'INSERT' then 'client.contact_created'
      when 'UPDATE' then 'client.contact_updated'
      else 'client.contact_removed'
    end,
    jsonb_build_object('client_contact_id', row_data.id)
  );

  return row_data;
end;
$$;

revoke all on function private.audit_client_contact_change()
  from public, anon, authenticated;
grant execute on function private.audit_client_contact_change()
  to postgres, service_role;

create trigger client_contacts_audit_change
after insert or update or delete on public.client_contacts
for each row execute function private.audit_client_contact_change();

insert into public.client_contacts (
  organization_id,
  client_id,
  email,
  phone,
  responsible_area,
  position
)
select
  organization_id,
  id,
  nullif(lower(trim(contact_email)), ''),
  nullif(trim(contact_phone), ''),
  null,
  0
from public.clients
where deleted_at is null
  and (nullif(trim(contact_email), '') is not null or nullif(trim(contact_phone), '') is not null);
