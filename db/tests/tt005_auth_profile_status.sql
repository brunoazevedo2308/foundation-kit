-- DP Suite — TT-005 (corrected)
-- Reproducible test for post-sign-in profile-status gating.
--
-- Usage:
--   * Development or Staging ONLY. Never run against Production.
--   * Runs as a privileged role (service_role / postgres) in the Supabase
--     SQL Editor or via psql. The whole script is wrapped in a transaction
--     that always ends in ROLLBACK, so no data persists.
--
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f db/tests/tt005_auth_profile_status.sql
--
-- What it verifies (backlog terminology: active | inactive | blocked):
--   * `public.record_profile_login()` returns the caller's current status.
--   * `last_login_at` is stamped only when status = 'active'.
--   * An inactive / blocked profile does NOT get last_login_at updated.
--   * Soft-deleted profiles are reported as 'blocked' (invisible under
--     the existing profiles_select_same_org RLS policy).
--   * A user with no profile row is reported as 'blocked'.
--   * Calling without an authenticated session raises an error.
--   * The RPC is SECURITY INVOKER: it cannot read or update another user's
--     profile row.

begin;

-- ---------------------------------------------------------------------------
-- Helpers (temporary — dropped by ROLLBACK).
-- ---------------------------------------------------------------------------

create or replace function pg_temp.assume_user(_uid uuid)
returns void
language plpgsql
as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', _uid::text, 'role', 'authenticated')::text,
    true
  );
  execute 'set local role authenticated';
end;
$$;

create or replace function pg_temp.reset_role()
returns void
language plpgsql
as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end;
$$;

create or replace function pg_temp.fail(_label text)
returns void
language plpgsql
as $$
begin
  raise exception 'TT-005 assertion failed: %', _label;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

do $$
declare
  _org_id       uuid := gen_random_uuid();
  _other_org_id uuid := gen_random_uuid();
  _active_id    uuid := gen_random_uuid();
  _inactive_id  uuid := gen_random_uuid();
  _blocked_id   uuid := gen_random_uuid();
  _deleted_id   uuid := gen_random_uuid();
  _noprofile_id uuid := gen_random_uuid();
  _other_id     uuid := gen_random_uuid();
begin
  insert into public.organizations (id, name, slug)
    values
      (_org_id,       'TT-005 Org',       'tt005-org'),
      (_other_org_id, 'TT-005 Other Org', 'tt005-other-org');

  insert into auth.users (id, email)
    values
      (_active_id,    'tt005-active@example.test'),
      (_inactive_id,  'tt005-inactive@example.test'),
      (_blocked_id,   'tt005-blocked@example.test'),
      (_deleted_id,   'tt005-deleted@example.test'),
      (_noprofile_id, 'tt005-noprofile@example.test'),
      (_other_id,     'tt005-other@example.test');

  -- Note: no profile row for _noprofile_id — that's the point of case 5.
  insert into public.profiles (id, organization_id, status, deleted_at)
    values
      (_active_id,   _org_id,       'active',   null),
      (_inactive_id, _org_id,       'inactive', null),
      (_blocked_id,  _org_id,       'blocked',  null),
      (_deleted_id,  _org_id,       'active',   now()),
      (_other_id,    _other_org_id, 'active',   null);

  perform set_config('tt005.org_id',        _org_id::text,       true);
  perform set_config('tt005.active_id',     _active_id::text,    true);
  perform set_config('tt005.inactive_id',   _inactive_id::text,  true);
  perform set_config('tt005.blocked_id',    _blocked_id::text,   true);
  perform set_config('tt005.deleted_id',    _deleted_id::text,   true);
  perform set_config('tt005.noprofile_id',  _noprofile_id::text, true);
  perform set_config('tt005.other_id',      _other_id::text,     true);
end
$$;

-- ---------------------------------------------------------------------------
-- Case 1: active profile — status='active' returned and last_login_at set.
-- ---------------------------------------------------------------------------
do $$
declare
  _uid uuid := current_setting('tt005.active_id')::uuid;
  _status public.profile_status;
  _last  timestamptz;
begin
  perform pg_temp.assume_user(_uid);
  select public.record_profile_login() into _status;
  perform pg_temp.reset_role();

  if _status is distinct from 'active'::public.profile_status then
    perform pg_temp.fail('active user should return status=active, got ' || coalesce(_status::text, 'NULL'));
  end if;

  select last_login_at into _last from public.profiles where id = _uid;
  if _last is null then
    perform pg_temp.fail('active user should have last_login_at set');
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Case 2: inactive profile — status='inactive' returned, last_login_at NOT set.
-- ---------------------------------------------------------------------------
do $$
declare
  _uid uuid := current_setting('tt005.inactive_id')::uuid;
  _status public.profile_status;
  _last  timestamptz;
begin
  perform pg_temp.assume_user(_uid);
  select public.record_profile_login() into _status;
  perform pg_temp.reset_role();

  if _status is distinct from 'inactive'::public.profile_status then
    perform pg_temp.fail('inactive user should return status=inactive, got ' || coalesce(_status::text, 'NULL'));
  end if;

  select last_login_at into _last from public.profiles where id = _uid;
  if _last is not null then
    perform pg_temp.fail('inactive user must NOT get last_login_at stamped');
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Case 3: blocked profile — status='blocked' returned, last_login_at NOT set.
-- ---------------------------------------------------------------------------
do $$
declare
  _uid uuid := current_setting('tt005.blocked_id')::uuid;
  _status public.profile_status;
  _last  timestamptz;
begin
  perform pg_temp.assume_user(_uid);
  select public.record_profile_login() into _status;
  perform pg_temp.reset_role();

  if _status is distinct from 'blocked'::public.profile_status then
    perform pg_temp.fail('blocked user should return status=blocked, got ' || coalesce(_status::text, 'NULL'));
  end if;

  select last_login_at into _last from public.profiles where id = _uid;
  if _last is not null then
    perform pg_temp.fail('blocked user must NOT get last_login_at stamped');
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Case 4: soft-deleted profile — reported as 'blocked' (invisible under RLS).
-- ---------------------------------------------------------------------------
do $$
declare
  _uid uuid := current_setting('tt005.deleted_id')::uuid;
  _status public.profile_status;
  _last  timestamptz;
begin
  perform pg_temp.assume_user(_uid);
  select public.record_profile_login() into _status;
  perform pg_temp.reset_role();

  if _status is distinct from 'blocked'::public.profile_status then
    perform pg_temp.fail('soft-deleted profile should be reported as blocked, got ' || coalesce(_status::text, 'NULL'));
  end if;

  select last_login_at into _last from public.profiles where id = _uid;
  if _last is not null then
    perform pg_temp.fail('soft-deleted profile must NOT get last_login_at stamped');
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Case 5: authenticated user with NO profile row — reported as 'blocked'.
-- ---------------------------------------------------------------------------
do $$
declare
  _uid uuid := current_setting('tt005.noprofile_id')::uuid;
  _status public.profile_status;
begin
  perform pg_temp.assume_user(_uid);
  select public.record_profile_login() into _status;
  perform pg_temp.reset_role();

  if _status is distinct from 'blocked'::public.profile_status then
    perform pg_temp.fail('user without profile row should be reported as blocked, got ' || coalesce(_status::text, 'NULL'));
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Case 6: no authenticated session — the RPC must raise.
-- ---------------------------------------------------------------------------
do $$
declare
  _raised boolean := false;
  _dummy  public.profile_status;
begin
  begin
    perform set_config('request.jwt.claims', '', true);
    execute 'set local role authenticated';
    select public.record_profile_login() into _dummy;
    execute 'reset role';
  exception when others then
    _raised := true;
    execute 'reset role';
  end;

  if not _raised then
    perform pg_temp.fail('record_profile_login must raise without auth.uid()');
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Case 7: SECURITY INVOKER isolation — a caller cannot see or update
-- another user's profile through the RPC's SELECT/UPDATE, and last_login_at
-- of a different-organization user is never touched.
-- ---------------------------------------------------------------------------
do $$
declare
  _me    uuid := current_setting('tt005.active_id')::uuid;
  _other uuid := current_setting('tt005.other_id')::uuid;
  _last_other_before timestamptz;
  _last_other_after  timestamptz;
begin
  select last_login_at into _last_other_before from public.profiles where id = _other;

  perform pg_temp.assume_user(_me);
  perform public.record_profile_login();
  perform pg_temp.reset_role();

  select last_login_at into _last_other_after from public.profiles where id = _other;

  if _last_other_before is distinct from _last_other_after then
    perform pg_temp.fail('record_profile_login must not touch other users profiles');
  end if;
end
$$;

do $$
begin
  raise notice 'TT-005 auth profile status tests: ALL ASSERTIONS PASSED';
end
$$;

rollback;
