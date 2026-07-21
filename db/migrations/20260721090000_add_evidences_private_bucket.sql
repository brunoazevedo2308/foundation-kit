-- DP Suite — TT-007
-- Versioned migration: Evidences private storage.
--
-- STATUS: Already applied to remote (Development). This migration is
-- idempotent and safe to re-run; it mirrors the current remote state for
-- versioning / fresh environments only. Do NOT re-apply against a
-- Development database that already reflects this configuration.
--
-- Scope:
--   * Register the private storage bucket `evidences-private` with a
--     50 MiB per-object size limit and the exact remote MIME whitelist:
--     PDF, JPEG, PNG, WEBP, TXT, CSV, DOCX, XLSX.
--     Legacy MS Office (.doc/.xls), PowerPoint (.ppt/.pptx) and GIF are
--     intentionally NOT allowed.
--   * Centralize object authorization in
--     `private.can_access_evidence_object(_name text, _require_uploader boolean)`.
--     SELECT passes `false`; INSERT passes `true` to additionally require
--     `evidences.uploaded_by = auth.uid()`.
--   * Storage RLS policies on `storage.objects`:
--       - evidence_objects_select_authorized
--       - evidence_objects_insert_authorized
--     No UPDATE/DELETE policies by design (new versions => new Evidence id
--     => new object path; history is preserved).
--   * Table-level policy on `public.evidences`:
--       - evidences_insert_authorized_deliverable
--     ensures the metadata row belongs to a Deliverable/Action that the
--     caller can act on.
--   * `public.enforce_evidence_org_integrity()` trigger validates
--     Action/Deliverable are active (not soft-deleted, in the same
--     Organization) and enforces the canonical path <-> `file_name`
--     correspondence.
--
-- Canonical object path (enforced by RLS + trigger + module):
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
-- Centralized authorization helper (SECURITY DEFINER, two-arg signature)
-- =============================================================================
create or replace function private.can_access_evidence_object(
  _name              text,
  _require_uploader  boolean
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
      from public.evidences    e
      join public.deliverables d on d.id = e.deliverable_id
      join public.actions      a on a.id = d.action_id
      join public.profiles     p on p.id = auth.uid()
     where e.deleted_at is null
       and d.deleted_at is null
       and a.deleted_at is null
       and p.deleted_at is null
       and p.status = 'active'
       and p.organization_id = e.organization_id
       and a.organization_id = e.organization_id
       and d.organization_id = e.organization_id
       and e.storage_path = _name
       and _name = format(
             'organization/%s/actions/%s/deliverables/%s/evidences/%s/%s',
             e.organization_id,
             a.id,
             e.deliverable_id,
             e.id,
             split_part(_name, '/', 9)
           )
       and (_require_uploader is false or e.uploaded_by = auth.uid())
  );
$$;

comment on function private.can_access_evidence_object(text, boolean) is
  'Centralized authorization for storage.objects in evidences-private. '
  'Validates canonical path + matching public.evidences row + active '
  'Action/Deliverable + active caller in the owning Organization. When '
  '_require_uploader is true, additionally enforces evidences.uploaded_by '
  '= auth.uid() (used by the INSERT policy).';

revoke all on function private.can_access_evidence_object(text, boolean) from public;
grant execute on function private.can_access_evidence_object(text, boolean) to authenticated;

-- =============================================================================
-- RLS policies on storage.objects (scoped to the evidences bucket)
-- =============================================================================
drop policy if exists "evidence_objects_select_authorized" on storage.objects;
drop policy if exists "evidence_objects_insert_authorized" on storage.objects;

create policy "evidence_objects_select_authorized"
on storage.objects for select
to authenticated
using (
  bucket_id = 'evidences-private'
  and private.can_access_evidence_object(storage.objects.name, false)
);

create policy "evidence_objects_insert_authorized"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'evidences-private'
  and private.can_access_evidence_object(storage.objects.name, true)
);

-- No UPDATE / DELETE policies by design.

-- =============================================================================
-- Table-level INSERT policy on public.evidences
-- =============================================================================
drop policy if exists "evidences_insert_authorized_deliverable" on public.evidences;

create policy "evidences_insert_authorized_deliverable"
on public.evidences for insert
to authenticated
with check (
  uploaded_by = auth.uid()
  and exists (
    select 1
      from public.deliverables d
      join public.actions      a on a.id = d.action_id
      join public.profiles     p on p.id = auth.uid()
     where d.id = evidences.deliverable_id
       and d.deleted_at is null
       and a.deleted_at is null
       and p.deleted_at is null
       and p.status = 'active'
       and p.organization_id = evidences.organization_id
       and d.organization_id = evidences.organization_id
       and a.organization_id = evidences.organization_id
  )
);

-- =============================================================================
-- Integrity trigger: canonical path <-> file_name + active Action/Deliverable
-- =============================================================================
create or replace function public.enforce_evidence_org_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  _action_id      uuid;
  _deliv_org      uuid;
  _action_org     uuid;
  _deliv_deleted  timestamptz;
  _action_deleted timestamptz;
  _expected_path  text;
begin
  select d.action_id, d.organization_id, d.deleted_at,
         a.organization_id, a.deleted_at
    into _action_id, _deliv_org, _deliv_deleted,
         _action_org, _action_deleted
    from public.deliverables d
    join public.actions      a on a.id = d.action_id
   where d.id = new.deliverable_id;

  if _action_id is null then
    raise exception 'evidence_integrity: deliverable % not found', new.deliverable_id
      using errcode = '23514';
  end if;
  if _deliv_deleted is not null or _action_deleted is not null then
    raise exception 'evidence_integrity: action/deliverable is not active'
      using errcode = '23514';
  end if;
  if _deliv_org <> new.organization_id or _action_org <> new.organization_id then
    raise exception 'evidence_integrity: cross-organization reference'
      using errcode = '23514';
  end if;

  _expected_path := format(
    'organization/%s/actions/%s/deliverables/%s/evidences/%s/%s',
    new.organization_id,
    _action_id,
    new.deliverable_id,
    new.id,
    new.file_name
  );

  if new.storage_path is null or new.storage_path <> _expected_path then
    raise exception 'evidence_integrity: storage_path does not match canonical path for file_name'
      using errcode = '23514';
  end if;

  if split_part(new.storage_path, '/', 9) <> new.file_name then
    raise exception 'evidence_integrity: storage_path filename segment does not match file_name'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function public.enforce_evidence_org_integrity() is
  'BEFORE INSERT/UPDATE trigger on public.evidences. Validates Action + '
  'Deliverable are active and same-organization, and that storage_path '
  'equals the canonical path built from organization_id/action_id/'
  'deliverable_id/id/file_name.';

drop trigger if exists enforce_evidence_org_integrity_trg on public.evidences;
create trigger enforce_evidence_org_integrity_trg
  before insert or update on public.evidences
  for each row execute function public.enforce_evidence_org_integrity();
