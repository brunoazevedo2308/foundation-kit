-- DP Suite — US-008 (1º ciclo)
-- Versioned migration: Attachments private storage.
--
-- STATUS: Already applied to Supabase Development. This file mirrors the
-- current remote state and remains idempotent for environment bootstrap.
--
-- Scope:
--   * Private bucket `attachments-private` (25 MiB per object, explicit
--     MIME whitelist). NEVER reuse `evidences-private` for attachments.
--   * Canonical object path (tenant-scoped):
--       {organization_id}/{attachment_id}/{safe_file_name}
--   * SELECT/INSERT policies on storage.objects only. No UPDATE/DELETE by
--     design: deletion is logical (public.attachments.deleted_at) and the
--     object stays for auditability.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'attachments-private',
  'attachments-private',
  false,
  26214400, -- 25 MiB
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'text/plain',
    'text/csv',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- =============================================================================
-- Centralized authorization helper
-- =============================================================================
create or replace function private.can_access_attachment_object(
  _name             text,
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
      from public.attachments a
      join public.profiles    p on p.id = auth.uid()
     where a.deleted_at is null
       and p.deleted_at is null
       and p.status = 'active'
       and p.organization_id = a.organization_id
       and a.storage_path = _name
       and _name = format('%s/%s/%s', a.organization_id, a.id, split_part(_name, '/', 3))
       and split_part(_name, '/', 4) = ''
       and (_require_uploader is false or a.uploaded_by = auth.uid())
  );
$$;

comment on function private.can_access_attachment_object(text, boolean) is
  'Centralized authorization for storage.objects in attachments-private. '
  'Validates the canonical path {organization_id}/{attachment_id}/{file} '
  'against an active public.attachments row and an active caller in the '
  'owning Organization. When _require_uploader is true, additionally '
  'enforces attachments.uploaded_by = auth.uid() (INSERT policy).';

revoke all on function private.can_access_attachment_object(text, boolean) from public;
grant execute on function private.can_access_attachment_object(text, boolean) to authenticated;

-- =============================================================================
-- RLS policies on storage.objects (scoped to the attachments bucket)
-- =============================================================================
drop policy if exists "attachment_objects_select_authorized" on storage.objects;
drop policy if exists "attachment_objects_insert_authorized" on storage.objects;

create policy "attachment_objects_select_authorized"
on storage.objects for select
to authenticated
using (
  bucket_id = 'attachments-private'
  and private.can_access_attachment_object(storage.objects.name, false)
);

create policy "attachment_objects_insert_authorized"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'attachments-private'
  and private.can_access_attachment_object(storage.objects.name, true)
);

-- No UPDATE / DELETE policies by design.
