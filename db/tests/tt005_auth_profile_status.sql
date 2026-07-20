-- DP Suite — TT-005
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
-- What it verifies:
--   * `public.record_profile_login()` returns the caller's current status.
--   * `last_login_at` is stamped only when status = 'active'.
--   * A pending / inactive profile does NOT get last_login_at updated,
--     even though authentication itself succeeded.
--   * Soft-deleted profiles are reported as 'inactive'.
--   * Calling without an authenticated session raises an error.

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
  _org_id      uuid := gen_random_uuid();
  _active_id   uuid := gen_random_uuid();
  _pending_id  uuid := gen_random_uuid();
  _inactive_id uuid := gen_random_uuid();
  _deleted_id  uuid := gen_random_uuid();
begin
  insert into public.organizations (id, name, slug)
    values (_org_id, 'TT-005 Org', 'tt005-org');

  insert into auth.users (id, email)
    values
      (_active_id,   'tt005-active@example.test'),
      (_pending_id,  'tt005-pending@example.test'),
      (_inactive_id, 'tt005-inactive@example.test'),
      (_deleted_id,  'tt005-deleted@example.test');

  insert into public.profiles (id, organization_id, status, deleted_at)
    values
      (_active_id,   _org_id, 'active',   null),
      (_pending_id,  _org_id, 'pending',  null),
      (_inactive_id, _org_id, 'inactive', null),
      (_deleted_id,  _org_id, 'active',   now());

  -- Publish IDs to the session for later steps.
  perform set_config('tt005.org_id',      _org_id::text,      true);
  perform set_config('tt005.active_id',   _active_id::text,   true);
  perform set_config('tt005.pending_id',  _pending_id::text,  true);
  perform set_config('tt005.inactive_id', _inactive_id::text, true);
  perform set_config('tt005.deleted_id',  _deleted_id::text,  true);
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
-- Case 2: pending profile — status='pending' returned, last_login_at NOT set.
-- ---------------------------------------------------------------------------
do $$
declare
  _uid uuid := current_setting('tt005.pending_id')::uuid;
  _status public.profile_status;
  _last  timestamptz;
begin
  perform pg_temp.assume_user(_uid);
  select public.record_profile_login() into _status;
  perform pg_temp.reset_role();

  if _status is distinct from 'pending'::public.profile_status then
    perform pg_temp.fail('pending user should return status=pending');
  end if;

  select last_login_at into _last from public.profiles where id = _uid;
  if _last is not null then
    perform pg_temp.fail('pending user must NOT get last_login_at stamped');
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Case 3: inactive profile — status='inactive' returned, last_login_at NOT set.
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
    perform pg_temp.fail('inactive user should return status=inactive');
  end if;

  select last_login_at into _last from public.profiles where id = _uid;
  if _last is not null then
    perform pg_temp.fail('inactive user must NOT get last_login_at stamped');
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Case 4: soft-deleted profile — reported as 'inactive'.
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

  if _status is distinct from 'inactive'::public.profile_status then
    perform pg_temp.fail('soft-deleted profile should be reported as inactive');
  end if;

  select last_login_at into _last from public.profiles where id = _uid;
  if _last is not null then
    perform pg_temp.fail('soft-deleted profile must NOT get last_login_at stamped');
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Case 5: no authenticated session — the RPC must raise.
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

do $$
begin
  raise notice 'TT-005 auth profile status tests: ALL ASSERTIONS PASSED';
end
$$;

rollback;
