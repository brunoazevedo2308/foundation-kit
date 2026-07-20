-- DP Suite — TT-005 (corrected pre-application)
-- Auth: profile lifecycle status + last-login tracking.
--
-- Terminology (backlog-approved):
--   profile_status enum values = 'active' | 'inactive' | 'blocked'.
--   Any missing or soft-deleted profile is treated as `blocked` by the app,
--   without introducing a fourth enum value.
--
-- Scope:
--   * Add lifecycle status to `public.profiles` so the app can reject
--     sign-ins from disabled/blocked users AFTER Supabase Auth has
--     authenticated them.
--   * Record the timestamp of the last successful sign-in on the profile.
--   * Expose `public.record_profile_login()` — a SECURITY INVOKER RPC that
--     the client calls right after `signInWithPassword` succeeds. It runs
--     under the caller's privileges, so it is fully constrained by the
--     existing RLS policies (profiles_select_same_org + profiles_update_self);
--     it cannot read or update any row other than the caller's own profile.
--
-- Non-goals:
--   * No changes to RLS policies (already in place from TT-004.x).
--   * No new tables. No auth-schema modifications.
--   * Does not create Supabase Auth users; that is done via the client SDK
--     or the Supabase dashboard.

-- -----------------------------------------------------------------------------
-- Enum: profile lifecycle status
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'profile_status') then
    create type public.profile_status as enum ('active', 'inactive', 'blocked');
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- Columns on public.profiles
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists status         public.profile_status not null default 'active',
  add column if not exists last_login_at  timestamptz;

comment on column public.profiles.status is
  'Lifecycle state gating application access. Only ''active'' profiles may use the app. Enum: active | inactive | blocked.';
comment on column public.profiles.last_login_at is
  'Timestamp of the last successful application sign-in (set by public.record_profile_login()).';

create index if not exists profiles_status_idx
  on public.profiles (status)
  where deleted_at is null;

-- -----------------------------------------------------------------------------
-- RPC: public.record_profile_login()
--
-- SECURITY INVOKER — the function runs with the caller's privileges, so:
--   * SELECT is filtered by `profiles_select_same_org` (id must belong to
--     the caller's organization AND deleted_at IS NULL). A missing row,
--     a soft-deleted row, or a row whose organization is not the caller's
--     is invisible → the RPC returns 'blocked'.
--   * The UPDATE that stamps last_login_at is authorised only by
--     `profiles_update_self` (id = auth.uid(), same org, not soft-deleted).
--   * The function never bypasses RLS. It cannot read or modify any row
--     other than the caller's own profile.
-- The Security Advisor `security_definer_view`/exposed-definer warnings
-- do not apply.
-- -----------------------------------------------------------------------------
create or replace function public.record_profile_login()
returns public.profile_status
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  _uid    uuid := auth.uid();
  _status public.profile_status;
begin
  if _uid is null then
    raise exception 'record_profile_login: no authenticated user' using errcode = '28000';
  end if;

  -- RLS-scoped SELECT. If the caller's profile is missing, soft-deleted,
  -- or detached from an organization, no row is returned → blocked.
  select p.status
    into _status
  from public.profiles p
  where p.id = _uid;

  if _status is null then
    return 'blocked'::public.profile_status;
  end if;

  if _status = 'active' then
    -- RLS-scoped UPDATE. Fails silently (0 rows) if profiles_update_self
    -- would not authorise it, which for an active caller cannot happen.
    update public.profiles
       set last_login_at = now()
     where id = _uid;
  end if;

  return _status;
end;
$$;

comment on function public.record_profile_login() is
  'TT-005: post-sign-in check. Returns caller profile_status and stamps last_login_at when active. SECURITY INVOKER — fully constrained by existing profiles RLS policies.';

-- Explicit authenticated-only EXECUTE. Public/anon revoked. service_role
-- is not granted here: the RPC is a client-side post-sign-in helper and
-- back-office code can update `profiles.last_login_at` directly.
revoke all on function public.record_profile_login() from public;
revoke all on function public.record_profile_login() from anon;
grant execute on function public.record_profile_login() to authenticated;
