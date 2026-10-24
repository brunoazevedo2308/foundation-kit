create table public.document_companies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  name text not null,
  created_by uuid not null
    references public.profiles(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint document_companies_name_length_check
    check (char_length(trim(name)) between 2 and 160)
);

comment on table public.document_companies is
  'Companies used to organize the tenant document library.';
comment on column public.document_companies.organization_id is
  'Owning organization used as the tenant boundary.';

create unique index document_companies_org_active_name_uidx
  on public.document_companies (organization_id, lower(trim(name)))
  where deleted_at is null;

create index document_companies_organization_id_idx
  on public.document_companies (organization_id, name)
  where deleted_at is null;

create trigger document_companies_set_updated_at
before update on public.document_companies
for each row execute function public.set_updated_at();

alter table public.document_companies enable row level security;

create policy document_companies_select_same_org
on public.document_companies
for select
to authenticated
using (
  organization_id = (select private.current_organization_id())
  and (
    deleted_at is null
    or (select private.can_manage_operational_data())
  )
);

create policy document_companies_insert_same_org_admin
on public.document_companies
for insert
to authenticated
with check (
  organization_id = (select private.current_organization_id())
  and created_by = (select auth.uid())
  and deleted_at is null
  and (select private.can_manage_operational_data())
);

grant select on public.document_companies to authenticated;
grant insert (organization_id, name) on public.document_companies to authenticated;
grant all on public.document_companies to service_role;

create or replace function private.audit_document_company_change()
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
    'document_company',
    new.id,
    'document_company.created',
    jsonb_build_object('name', new.name)
  );

  return new;
end;
$$;

revoke all on function private.audit_document_company_change()
  from public, anon, authenticated;
grant execute on function private.audit_document_company_change()
  to postgres, service_role;

create trigger document_companies_audit_change
after insert on public.document_companies
for each row execute function private.audit_document_company_change();
