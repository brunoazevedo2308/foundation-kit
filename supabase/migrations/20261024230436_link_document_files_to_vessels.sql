alter table public.document_files
  add column vessel_id uuid not null
    references public.vessels(id) on delete restrict;

comment on column public.document_files.vessel_id is
  'Vessel whose private document library contains this file.';

create index document_files_company_vessel_category_created_idx
  on public.document_files (company_id, vessel_id, category, created_at desc)
  where deleted_at is null;

create index document_files_vessel_id_idx
  on public.document_files (vessel_id)
  where deleted_at is null;

create or replace function private.enforce_document_file_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  company_org uuid;
  vessel_org uuid;
begin
  select organization_id
    into company_org
    from public.document_companies
   where id = new.company_id
     and deleted_at is null;

  perform public.assert_same_org(
    new.organization_id,
    company_org,
    'document_file.company_id'
  );

  select organization_id
    into vessel_org
    from public.vessels
   where id = new.vessel_id
     and deleted_at is null;

  perform public.assert_same_org(
    new.organization_id,
    vessel_org,
    'document_file.vessel_id'
  );

  if new.uploaded_by <> auth.uid() then
    raise exception 'document_file.uploaded_by must match the authenticated user';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_document_file_integrity()
  from public, anon, authenticated;
grant execute on function private.enforce_document_file_integrity()
  to postgres, service_role;

create or replace function private.guard_document_file_soft_delete()
returns trigger
language plpgsql
set search_path = pg_catalog, public, private
as $$
begin
  if new.id is distinct from old.id
    or new.organization_id is distinct from old.organization_id
    or new.company_id is distinct from old.company_id
    or new.vessel_id is distinct from old.vessel_id
    or new.category is distinct from old.category
    or new.file_name is distinct from old.file_name
    or new.storage_path is distinct from old.storage_path
    or new.mime_type is distinct from old.mime_type
    or new.size_bytes is distinct from old.size_bytes
    or new.uploaded_by is distinct from old.uploaded_by
    or new.created_at is distinct from old.created_at
    or old.deleted_at is not null
    or new.deleted_at is null then
    raise exception 'Only the first soft-delete is allowed for document files';
  end if;

  return new;
end;
$$;

revoke all on function private.guard_document_file_soft_delete()
  from public, anon, authenticated;
grant execute on function private.guard_document_file_soft_delete()
  to postgres, service_role;

drop policy document_files_select_same_org on public.document_files;
create policy document_files_select_same_org
on public.document_files
for select
to authenticated
using (
  organization_id = (select private.current_organization_id())
  and deleted_at is null
  and exists (
    select 1
      from public.document_companies company
     where company.id = company_id
       and company.organization_id = (select private.current_organization_id())
       and company.deleted_at is null
  )
  and exists (
    select 1
      from public.vessels vessel
     where vessel.id = vessel_id
       and vessel.organization_id = (select private.current_organization_id())
       and vessel.deleted_at is null
  )
);

drop policy document_files_insert_same_org_admin on public.document_files;
create policy document_files_insert_same_org_admin
on public.document_files
for insert
to authenticated
with check (
  organization_id = (select private.current_organization_id())
  and uploaded_by = (select auth.uid())
  and deleted_at is null
  and (select private.can_manage_operational_data())
  and exists (
    select 1
      from public.document_companies company
     where company.id = company_id
       and company.organization_id = (select private.current_organization_id())
       and company.deleted_at is null
  )
  and exists (
    select 1
      from public.vessels vessel
     where vessel.id = vessel_id
       and vessel.organization_id = (select private.current_organization_id())
       and vessel.deleted_at is null
  )
);

grant insert (vessel_id) on public.document_files to authenticated;

create or replace function private.audit_document_file_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  row_data public.document_files;
begin
  row_data := new;

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
    'document_file',
    row_data.id,
    case when tg_op = 'INSERT'
      then 'document_file.created'
      else 'document_file.removed'
    end,
    jsonb_build_object(
      'company_id', row_data.company_id,
      'vessel_id', row_data.vessel_id,
      'category', row_data.category
    )
  );

  return new;
end;
$$;

revoke all on function private.audit_document_file_change()
  from public, anon, authenticated;
grant execute on function private.audit_document_file_change()
  to postgres, service_role;
