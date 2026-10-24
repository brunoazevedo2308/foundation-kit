create table public.document_files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  company_id uuid not null
    references public.document_companies(id) on delete restrict,
  category text not null,
  file_name text not null,
  storage_path text not null unique,
  mime_type text not null,
  size_bytes bigint not null,
  uploaded_by uuid not null
    references public.profiles(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint document_files_category_check
    check (category in ('procedures', 'forms', 'trials-fmea', 'documents')),
  constraint document_files_name_length_check
    check (
      char_length(file_name) between 1 and 180
      and file_name = btrim(file_name)
      and position('/' in file_name) = 0
      and position(chr(92) in file_name) = 0
    ),
  constraint document_files_storage_path_check
    check (storage_path = format('%s/%s/%s', organization_id, id, file_name)),
  constraint document_files_mime_type_check
    check (mime_type in (
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'text/plain',
      'text/csv',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )),
  constraint document_files_size_check
    check (size_bytes between 1 and 26214400)
);

comment on table public.document_files is
  'Private files organized by document company and DP category.';
comment on column public.document_files.storage_path is
  'Canonical private Storage path: organization_id/document_file_id/file_name.';

create index document_files_company_category_created_idx
  on public.document_files (company_id, category, created_at desc)
  where deleted_at is null;
create index document_files_organization_id_idx
  on public.document_files (organization_id)
  where deleted_at is null;
create index document_files_uploaded_by_idx
  on public.document_files (uploaded_by);

create trigger document_files_set_updated_at
before update on public.document_files
for each row execute function public.set_updated_at();

create or replace function private.enforce_document_file_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  company_org uuid;
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

create trigger document_files_enforce_integrity
before insert on public.document_files
for each row execute function private.enforce_document_file_integrity();

create or replace function private.guard_document_file_soft_delete()
returns trigger
language plpgsql
set search_path = pg_catalog, public, private
as $$
begin
  if new.id is distinct from old.id
    or new.organization_id is distinct from old.organization_id
    or new.company_id is distinct from old.company_id
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

create trigger document_files_guard_soft_delete
before update on public.document_files
for each row execute function private.guard_document_file_soft_delete();

alter table public.document_files enable row level security;

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
);

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
);

create policy document_files_update_same_org_admin
on public.document_files
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

grant select on public.document_files to authenticated;
grant insert (
  id,
  organization_id,
  company_id,
  category,
  file_name,
  storage_path,
  mime_type,
  size_bytes,
  uploaded_by
) on public.document_files to authenticated;
grant update (deleted_at) on public.document_files to authenticated;
grant all on public.document_files to service_role;

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

create trigger document_files_audit_change
after insert or update of deleted_at on public.document_files
for each row execute function private.audit_document_file_change();

-- Extend the existing private bucket authorization without changing the
-- canonical three-segment path used by action attachments.
create or replace function private.can_access_attachment_object(
  _name text,
  _require_uploader boolean
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
      from public.attachments attachment
      join public.profiles profile on profile.id = auth.uid()
     where attachment.deleted_at is null
       and profile.deleted_at is null
       and profile.status = 'active'
       and profile.organization_id = attachment.organization_id
       and attachment.storage_path = _name
       and _name = format(
         '%s/%s/%s',
         attachment.organization_id,
         attachment.id,
         split_part(_name, '/', 3)
       )
       and split_part(_name, '/', 4) = ''
       and (_require_uploader is false or attachment.uploaded_by = auth.uid())
  ) or exists (
    select 1
      from public.document_files document_file
      join public.document_companies company
        on company.id = document_file.company_id
       and company.organization_id = document_file.organization_id
       and company.deleted_at is null
      join public.profiles profile on profile.id = auth.uid()
     where document_file.deleted_at is null
       and profile.deleted_at is null
       and profile.status = 'active'
       and profile.organization_id = document_file.organization_id
       and document_file.storage_path = _name
       and _name = format(
         '%s/%s/%s',
         document_file.organization_id,
         document_file.id,
         split_part(_name, '/', 3)
       )
       and split_part(_name, '/', 4) = ''
       and (
         _require_uploader is false
         or (
           document_file.uploaded_by = auth.uid()
           and profile.role in ('system_admin', 'organization_admin')
         )
       )
  );
$$;

comment on function private.can_access_attachment_object(text, boolean) is
  'Authorizes private objects for action attachments and company document files. '
  'The canonical path is organization_id/record_id/file_name. Uploads additionally '
  'require the authenticated uploader; document uploads require an administrator.';

revoke all on function private.can_access_attachment_object(text, boolean)
  from public, anon, authenticated;
grant execute on function private.can_access_attachment_object(text, boolean)
  to authenticated;
