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
--     50 MiB per-object size limit and a strict whitelist of allowed
--     MIME types: PDF, JPEG, PNG, WEBP, TXT, CSV, DOCX, XLSX.
--     Legacy MS Office (.doc/.xls), PowerPoint (.ppt/.pptx) and GIF are
--     intentionally NOT allowed.
--   * Centralize object authorization in a single SECURITY DEFINER helper
--     `private.can_access_evidence_object(name text)` that validates:
--       - the canonical path shape;
--       - matching public.evidences row (organization / action /
--         deliverable / evidence, active + not soft-deleted);
--       - caller is member of the same Organization with an ACTIVE,
--         non-soft-deleted profile.
--   * Storage RLS policies on `storage.objects` (bucket-scoped) reuse the
--     helper. INSERT additionally requires `evidences.uploaded_by =
--     auth.uid()` so an upload can only be performed by the profile that
--     owns the metadata row.
--   * No UPDATE / no DELETE policies by design: new versions must create
--     a new Evidence row (new id + new path). History is preserved.
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
-- Centralized authorization helper (SECURITY DEFINER)
-- =============================================================================
-- Returns true when `_name` matches an active evidence row in the caller's
-- Organization AND the caller has an active profile in that Organization.
-- Kept in the `private` schema so it never appears in the Data API.
create or replace function private.can_access_evidence_object(_name text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
      from public.evidences   e
      join public.deliverables d on d.id = e.deliverable_id
      join public.profiles     p on p.id = auth.uid()
     where e.deleted_at is null
       and p.status = 'active'
       and p.deleted_at is null
       and p.organization_id = e.organization_id
       and e.storage_path    = _name
       and _name = format(
             'organization/%s/actions/%s/deliverables/%s/evidences/%s/%s',
             e.organization_id,
             d.action_id,
             e.deliverable_id,
             e.id,
             split_part(_name, '/', 9)
           )
  );
$$;

comment on function private.can_access_evidence_object(text) is
  'Centralized authorization for storage.objects in the evidences-private '
  'bucket. Validates canonical path, matching public.evidences row and '
  'active membership of the caller in the owning Organization.';

revoke all on function private.can_access_evidence_object(text) from public;
grant execute on function private.can_access_evidence_object(text) to authenticated;

-- =============================================================================
-- RLS policies on storage.objects (scoped to the evidences bucket)
-- =============================================================================
drop policy if exists "evidences_private_select" on storage.objects;
drop policy if exists "evidences_private_insert" on storage.objects;

-- SELECT: any active member of the owning Organization may read.
create policy "evidences_private_select"
on storage.objects for select
to authenticated
using (
  bucket_id = 'evidences-private'
  and private.can_access_evidence_object(storage.objects.name)
);

-- INSERT: same authorization as SELECT, plus the caller must be the
-- `uploaded_by` on the metadata row (metadata-first flow).
create policy "evidences_private_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'evidences-private'
  and private.can_access_evidence_object(storage.objects.name)
  and exists (
    select 1
      from public.evidences e
     where e.storage_path = storage.objects.name
       and e.uploaded_by  = auth.uid()
       and e.deleted_at is null
  )
);

-- No UPDATE / DELETE policies by design:
-- new versions => new Evidence id => new object path.
-- Historical objects remain readable via SELECT.
