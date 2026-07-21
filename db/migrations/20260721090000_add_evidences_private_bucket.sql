-- DP Suite — TT-007
-- Versioned migration: Evidences private storage.
--
-- STATUS: Already applied to remote (Development). This migration is
-- idempotent and safe to re-run; it represents the current remote state
-- for versioning / fresh environments only. Do NOT re-apply against a
-- Development database that already reflects this configuration.
--
-- Scope:
--   * Register the private storage bucket `evidences-private` with a
--     50 MB per-object size limit and a whitelist of allowed MIME types.
--   * Install RLS policies on `storage.objects` restricted to this bucket
--     so that only authenticated members of the owning Organization with
--     an ACTIVE profile can INSERT/SELECT an object AND only when the
--     canonical path matches an existing row in `public.evidences` that
--     lives in the same Organization.
--   * No UPDATE / no DELETE policies: new versions must create a new
--     Evidence row (new id + new path). History is preserved.
--
-- Canonical object path (enforced by RLS + module):
--   organization/{organization_id}/actions/{action_id}/deliverables/{deliverable_id}/evidences/{evidence_id}/{filename}

-- =============================================================================
-- Bucket registration (idempotent)
-- =============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'evidences-private',
  'evidences-private',
  false,
  52428800, -- 50 MiB
  array[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv'
  ]
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- =============================================================================
-- RLS policies on storage.objects (scoped to the evidences bucket)
-- =============================================================================
-- Drop-if-exists keeps the migration idempotent on re-runs.
drop policy if exists "evidences_private_select" on storage.objects;
drop policy if exists "evidences_private_insert" on storage.objects;

-- SELECT: authenticated members of the same Organization with an ACTIVE
-- profile may read the object only when the canonical path corresponds
-- to a live public.evidences row in the same Organization.
create policy "evidences_private_select"
on storage.objects for select
to authenticated
using (
  bucket_id = 'evidences-private'
  and exists (
    select 1
      from public.evidences e
      join public.deliverables d on d.id = e.deliverable_id
      join public.profiles p     on p.id = auth.uid()
     where e.deleted_at is null
       and p.status = 'active'
       and p.deleted_at is null
       and p.organization_id = e.organization_id
       and e.storage_path = storage.objects.name
       and storage.objects.name = format(
         'organization/%s/actions/%s/deliverables/%s/evidences/%s/%s',
         e.organization_id,
         d.action_id,
         e.deliverable_id,
         e.id,
         split_part(storage.objects.name, '/', 9)
       )
  )
);

-- INSERT: authenticated user with an ACTIVE profile may upload only if
-- the target object's name matches an already-inserted evidences row in
-- the same Organization (metadata-first flow).
create policy "evidences_private_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'evidences-private'
  and exists (
    select 1
      from public.evidences e
      join public.deliverables d on d.id = e.deliverable_id
      join public.profiles p     on p.id = auth.uid()
     where e.deleted_at is null
       and p.status = 'active'
       and p.deleted_at is null
       and p.organization_id = e.organization_id
       and e.storage_path = storage.objects.name
       and storage.objects.name = format(
         'organization/%s/actions/%s/deliverables/%s/evidences/%s/%s',
         e.organization_id,
         d.action_id,
         e.deliverable_id,
         e.id,
         split_part(storage.objects.name, '/', 9)
       )
  )
);

-- No UPDATE / DELETE policies by design:
-- new versions => new Evidence id => new object path.
-- Historical objects remain readable via SELECT.
