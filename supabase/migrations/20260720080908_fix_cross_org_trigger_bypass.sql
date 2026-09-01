-- DP Suite — TT-004.2.2
-- Fix: cross-organization integrity triggers were bypassable under RLS.
--
-- Problem
-- -------
-- The BEFORE INSERT/UPDATE trigger functions installed by TT-004.2 run as
-- INVOKER (the calling authenticated user). Their internal lookups
--   SELECT organization_id FROM public.<table> WHERE id = new.<fk>
-- are subject to the caller's RLS policies. When the caller references a
-- row from a different Organization, the SELECT returns NO ROWS (RLS
-- filters it), so `v_org` is NULL. The old `public.assert_same_org`
-- treated NULL as "nothing to check" and returned silently, letting the
-- write succeed. Concretely, an Action in Org A could reference a Client
-- from Org B — the exact case reproduced by TT-004.3.
--
-- Fix
-- ---
--   1. `assert_same_org` now rejects `_actual IS NULL` as a violation
--      (the caller was supposed to skip the check upstream when the FK
--      column itself is NULL — see point 2).
--   2. `enforce_vessel_org_integrity()` only validates the client link
--      when `new.client_id IS NOT NULL`, matching the pattern used by
--      the other enforce_* functions and preserving optional client_id.
--   3. All `public.enforce_*_org_integrity()` functions become
--      SECURITY DEFINER with `search_path = pg_catalog, public`, so
--      their internal lookups run as owner and bypass caller RLS.
--   4. EXECUTE on every trigger/helper function touched here is revoked
--      from `public`, `anon`, `authenticated`; only `service_role` keeps
--      it. Triggers still fire because Postgres invokes trigger
--      functions independently of role EXECUTE grants (owner call).
--
-- Not touched: triggers are NOT dropped/recreated — CREATE OR REPLACE
-- FUNCTION preserves the OID, so existing trigger bindings continue to
-- point at the updated definitions.

-- ============================================================================
-- 1. assert_same_org — treat NULL actual as a violation
-- ============================================================================

create or replace function public.assert_same_org(_expected uuid, _actual uuid, _label text)
returns void
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
begin
  if _actual is null then
    raise exception 'Cross-organization reference not allowed for %: expected %, got NULL (row not visible or missing)',
      _label, _expected
      using errcode = '42501';
  end if;
  if _expected is null or _expected <> _actual then
    raise exception 'Cross-organization reference not allowed for %: expected %, got %',
      _label, _expected, _actual
      using errcode = '42501';
  end if;
end;
$$;

revoke execute on function public.assert_same_org(uuid, uuid, text) from public;
revoke execute on function public.assert_same_org(uuid, uuid, text) from anon;
revoke execute on function public.assert_same_org(uuid, uuid, text) from authenticated;
grant  execute on function public.assert_same_org(uuid, uuid, text) to service_role;

-- ============================================================================
-- 2. Per-table trigger functions — SECURITY DEFINER + null-safe lookups
-- ============================================================================

create or replace function public.enforce_vessel_org_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_org uuid;
begin
  if new.client_id is not null then
    select organization_id into v_org from public.clients where id = new.client_id;
    perform public.assert_same_org(new.organization_id, v_org, 'vessel.client_id');
  end if;
  return new;
end;
$$;

create or replace function public.enforce_action_org_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_org uuid;
begin
  if new.client_id is not null then
    select organization_id into v_org from public.clients where id = new.client_id;
    perform public.assert_same_org(new.organization_id, v_org, 'action.client_id');
  end if;
  if new.vessel_id is not null then
    select organization_id into v_org from public.vessels where id = new.vessel_id;
    perform public.assert_same_org(new.organization_id, v_org, 'action.vessel_id');
  end if;
  if new.responsible_user_id is not null then
    select organization_id into v_org from public.profiles where id = new.responsible_user_id;
    perform public.assert_same_org(new.organization_id, v_org, 'action.responsible_user_id');
  end if;
  if new.created_by is not null then
    select organization_id into v_org from public.profiles where id = new.created_by;
    perform public.assert_same_org(new.organization_id, v_org, 'action.created_by');
  end if;
  return new;
end;
$$;

create or replace function public.enforce_deliverable_org_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.actions where id = new.action_id;
  perform public.assert_same_org(new.organization_id, v_org, 'deliverable.action_id');
  if new.responsible_user_id is not null then
    select organization_id into v_org from public.profiles where id = new.responsible_user_id;
    perform public.assert_same_org(new.organization_id, v_org, 'deliverable.responsible_user_id');
  end if;
  if new.created_by is not null then
    select organization_id into v_org from public.profiles where id = new.created_by;
    perform public.assert_same_org(new.organization_id, v_org, 'deliverable.created_by');
  end if;
  return new;
end;
$$;

create or replace function public.enforce_evidence_org_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.deliverables where id = new.deliverable_id;
  perform public.assert_same_org(new.organization_id, v_org, 'evidence.deliverable_id');
  if new.uploaded_by is not null then
    select organization_id into v_org from public.profiles where id = new.uploaded_by;
    perform public.assert_same_org(new.organization_id, v_org, 'evidence.uploaded_by');
  end if;
  return new;
end;
$$;

create or replace function public.enforce_comment_org_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_org uuid;
begin
  if new.action_id is not null then
    select organization_id into v_org from public.actions where id = new.action_id;
    perform public.assert_same_org(new.organization_id, v_org, 'comment.action_id');
  end if;
  if new.deliverable_id is not null then
    select organization_id into v_org from public.deliverables where id = new.deliverable_id;
    perform public.assert_same_org(new.organization_id, v_org, 'comment.deliverable_id');
  end if;
  if new.author_user_id is not null then
    select organization_id into v_org from public.profiles where id = new.author_user_id;
    perform public.assert_same_org(new.organization_id, v_org, 'comment.author_user_id');
  end if;
  return new;
end;
$$;

create or replace function public.enforce_attachment_org_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_org uuid;
begin
  if new.action_id is not null then
    select organization_id into v_org from public.actions where id = new.action_id;
    perform public.assert_same_org(new.organization_id, v_org, 'attachment.action_id');
  end if;
  if new.deliverable_id is not null then
    select organization_id into v_org from public.deliverables where id = new.deliverable_id;
    perform public.assert_same_org(new.organization_id, v_org, 'attachment.deliverable_id');
  end if;
  if new.comment_id is not null then
    select organization_id into v_org from public.comments where id = new.comment_id;
    perform public.assert_same_org(new.organization_id, v_org, 'attachment.comment_id');
  end if;
  if new.uploaded_by is not null then
    select organization_id into v_org from public.profiles where id = new.uploaded_by;
    perform public.assert_same_org(new.organization_id, v_org, 'attachment.uploaded_by');
  end if;
  return new;
end;
$$;

create or replace function public.enforce_user_vessel_org_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.profiles where id = new.profile_id;
  perform public.assert_same_org(new.organization_id, v_org, 'user_vessels.profile_id');
  select organization_id into v_org from public.vessels where id = new.vessel_id;
  perform public.assert_same_org(new.organization_id, v_org, 'user_vessels.vessel_id');
  if new.assigned_by is not null then
    select organization_id into v_org from public.profiles where id = new.assigned_by;
    perform public.assert_same_org(new.organization_id, v_org, 'user_vessels.assigned_by');
  end if;
  return new;
end;
$$;

create or replace function public.enforce_notification_org_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.profiles where id = new.recipient_user_id;
  perform public.assert_same_org(new.organization_id, v_org, 'notification.recipient_user_id');
  if new.actor_user_id is not null then
    select organization_id into v_org from public.profiles where id = new.actor_user_id;
    perform public.assert_same_org(new.organization_id, v_org, 'notification.actor_user_id');
  end if;
  return new;
end;
$$;

-- ============================================================================
-- 3. Lock down EXECUTE on the trigger functions.
--    Triggers still fire regardless of these grants — Postgres calls
--    trigger functions as the table owner path, not via EXECUTE checks
--    on the invoking role.
-- ============================================================================

do $$
declare
  fn text;
  fns text[] := array[
    'public.enforce_vessel_org_integrity()',
    'public.enforce_action_org_integrity()',
    'public.enforce_deliverable_org_integrity()',
    'public.enforce_evidence_org_integrity()',
    'public.enforce_comment_org_integrity()',
    'public.enforce_attachment_org_integrity()',
    'public.enforce_user_vessel_org_integrity()',
    'public.enforce_notification_org_integrity()'
  ];
begin
  foreach fn in array fns loop
    execute format('revoke execute on function %s from public',        fn);
    execute format('revoke execute on function %s from anon',          fn);
    execute format('revoke execute on function %s from authenticated', fn);
    execute format('grant  execute on function %s to service_role',    fn);
  end loop;
end;
$$;
