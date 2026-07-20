-- DP Suite — TT-005
-- Auth: profile status + last-login tracking.
--
-- Scope:
--   * Add lifecycle status to `public.profiles` so the app can reject sign-ins
--     from disabled/pending users AFTER Supabase Auth has authenticated them.
--   * Record the timestamp of the last successful sign-in on the profile.
--   * Expose `public.record_profile_login()` — a SECURITY DEFINER RPC that
--     the client calls right after `signInWithPassword` succeeds. It returns
--     the caller's current status and, when active, stamps `last_login_at`.
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
    create type public.profile_status as enum ('active', 'inactive', 'pending');
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
  'Lifecycle state gating application access. Only ''active'' profiles may use the app.';
comment on column public.profiles.last_login_at is
  'Timestamp of the last successful application sign-in (set by public.record_profile_login()).';

create index if not exists profiles_status_idx
  on public.profiles (status)
  where deleted_at is null;

-- -----------------------------------------------------------------------------
-- RPC: public.record_profile_login()
--
-- Called by the client immediately after a successful Supabase sign-in. Runs
-- as SECURITY DEFINER so it can update the profile row even under RLS. It:
--   * finds the profile for auth.uid();
--   * returns the current status;
--   * stamps last_login_at only when status = 'active' and the profile is
--     not soft-deleted.
-- The client is responsible for calling supabase.auth.signOut() when the
-- returned status is not 'active'.
-- -----------------------------------------------------------------------------
create or replace function public.record_profile_login()
returns public.profile_status
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  _uid    uuid := auth.uid();
  _status public.profile_status;
  _deleted timestamptz;
begin
  if _uid is null then
    raise exception 'record_profile_login: no authenticated user' using errcode = '28000';
  end if;

  select p.status, p.deleted_at
    into _status, _deleted
  from public.profiles p
  where p.id = _uid;

  if _status is null then
    -- No profile row yet — treat as pending so the client can react.
    return 'pending'::public.profile_status;
  end if;

  if _deleted is not null then
    return 'inactive'::public.profile_status;
  end if;

  if _status = 'active' then
    update public.profiles
       set last_login_at = now()
     where id = _uid;
  end if;

  return _status;
end;
$$;

comment on function public.record_profile_login() is
  'TT-005: post-sign-in check. Returns caller profile_status and stamps last_login_at when active.';

-- Only authenticated callers may execute it. service_role bypasses grants.
revoke all on function public.record_profile_login() from public;
revoke all on function public.record_profile_login() from anon;
grant execute on function public.record_profile_login() to authenticated;
grant execute on function public.record_profile_login() to service_role;
