-- DP Suite — TT-005 follow-up
-- Reproducible test for `private.handle_new_auth_user` + trigger
-- `on_auth_user_created_create_profile`.
--
-- Usage:
--   * Development or Staging ONLY. Never Production.
--   * Runs as a privileged role (service_role / postgres) in the Supabase
--     SQL Editor or via psql. The whole script is wrapped in a transaction
--     that always ends in ROLLBACK, so no data persists.
--
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f db/tests/tt005_auto_profile_on_signup.sql
--
-- What it verifies:
--   1. Valid organization_id in metadata → profile created, status=inactive
--      by default, full_name from metadata.
--   2. Missing organization_id → NO profile row is created.
--   3. Malformed organization_id (not a uuid) → NO profile row.
--   4. Unknown or soft-deleted organization_id → NO profile row.
--   5. status='active' in metadata → profile created with status='active'.
--   6. Any other status value in metadata → falls back to 'inactive'
--      (in particular, metadata cannot force 'blocked').
--   7. Missing full_name in metadata → full_name derived from e-mail prefix.
--   8. Pre-existing profile row → trigger is a no-op (does not overwrite).

begin;

create or replace function pg_temp.fail(_label text)
returns void
language plpgsql
as $$
begin
  raise exception 'TT-005 auto-profile assertion failed: %', _label;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures: one active org and one soft-deleted org.
-- ---------------------------------------------------------------------------
do $$
declare
  _org_id      uuid := gen_random_uuid();
  _dead_org_id uuid := gen_random_uuid();
begin
  insert into public.organizations (id, name, slug) values
    (_org_id,      'TT-005 Auto Org',      'tt005-auto-org'),
    (_dead_org_id, 'TT-005 Dead Org',      'tt005-auto-dead-org');
  update public.organizations set deleted_at = now() where id = _dead_org_id;

  perform set_config('tt005a.org_id',      _org_id::text,      true);
  perform set_config('tt005a.dead_org_id', _dead_org_id::text, true);
end
$$;

-- Helper: insert an auth.users row with the given metadata and return its id.
create or replace function pg_temp.new_auth_user(_email text, _meta jsonb)
returns uuid
language plpgsql
as $$
declare
  _id uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, raw_user_meta_data)
    values (_id, _email, coalesce(_meta, '{}'::jsonb));
  return _id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Case 1: valid org + full_name → profile created, status=inactive.
-- ---------------------------------------------------------------------------
do $$
declare
  _org uuid := current_setting('tt005a.org_id')::uuid;
  _uid uuid;
  _org_actual  uuid;
  _status      public.profile_status;
  _full_name   text;
begin
  _uid := pg_temp.new_auth_user(
    'tt005a-case1@example.test',
    jsonb_build_object('organization_id', _org::text, 'full_name', 'Ada Lovelace')
  );

  select organization_id, status, full_name
    into _org_actual, _status, _full_name
    from public.profiles where id = _uid;

  if _org_actual is distinct from _org then
    perform pg_temp.fail('case 1: profile.organization_id mismatch');
  end if;
  if _status is distinct from 'inactive'::public.profile_status then
    perform pg_temp.fail('case 1: expected status=inactive, got ' || coalesce(_status::text, 'NULL'));
  end if;
  if _full_name is distinct from 'Ada Lovelace' then
    perform pg_temp.fail('case 1: full_name should come from metadata, got ' || coalesce(_full_name, 'NULL'));
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Case 2: no organization_id in metadata → no profile created.
-- ---------------------------------------------------------------------------
do $$
declare _uid uuid;
begin
  _uid := pg_temp.new_auth_user('tt005a-case2@example.test', '{}'::jsonb);
  if exists (select 1 from public.profiles where id = _uid) then
    perform pg_temp.fail('case 2: profile must NOT be created without organization_id');
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Case 3: malformed organization_id → no profile created.
-- ---------------------------------------------------------------------------
do $$
declare _uid uuid;
begin
  _uid := pg_temp.new_auth_user(
    'tt005a-case3@example.test',
    jsonb_build_object('organization_id', 'not-a-uuid')
  );
  if exists (select 1 from public.profiles where id = _uid) then
    perform pg_temp.fail('case 3: profile must NOT be created for malformed organization_id');
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Case 4a: unknown organization_id → no profile.
-- Case 4b: soft-deleted organization_id → no profile.
-- ---------------------------------------------------------------------------
do $$
declare
  _dead uuid := current_setting('tt005a.dead_org_id')::uuid;
  _uid1 uuid;
  _uid2 uuid;
begin
  _uid1 := pg_temp.new_auth_user(
    'tt005a-case4a@example.test',
    jsonb_build_object('organization_id', gen_random_uuid()::text)
  );
  if exists (select 1 from public.profiles where id = _uid1) then
    perform pg_temp.fail('case 4a: profile must NOT be created for unknown organization_id');
  end if;

  _uid2 := pg_temp.new_auth_user(
    'tt005a-case4b@example.test',
    jsonb_build_object('organization_id', _dead::text)
  );
  if exists (select 1 from public.profiles where id = _uid2) then
    perform pg_temp.fail('case 4b: profile must NOT be created for soft-deleted organization_id');
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Case 5: status='active' in metadata → profile created active.
-- ---------------------------------------------------------------------------
do $$
declare
  _org uuid := current_setting('tt005a.org_id')::uuid;
  _uid uuid;
  _status public.profile_status;
begin
  _uid := pg_temp.new_auth_user(
    'tt005a-case5@example.test',
    jsonb_build_object('organization_id', _org::text, 'status', 'active', 'full_name', 'Grace Hopper')
  );
  select status into _status from public.profiles where id = _uid;
  if _status is distinct from 'active'::public.profile_status then
    perform pg_temp.fail('case 5: explicit status=active should be honored, got ' || coalesce(_status::text, 'NULL'));
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Case 6: metadata.status='blocked' (or any unsafe value) → fallback to inactive.
-- ---------------------------------------------------------------------------
do $$
declare
  _org uuid := current_setting('tt005a.org_id')::uuid;
  _uid uuid;
  _status public.profile_status;
begin
  _uid := pg_temp.new_auth_user(
    'tt005a-case6@example.test',
    jsonb_build_object('organization_id', _org::text, 'status', 'blocked')
  );
  select status into _status from public.profiles where id = _uid;
  if _status is distinct from 'inactive'::public.profile_status then
    perform pg_temp.fail('case 6: unsafe status values must fall back to inactive, got ' || coalesce(_status::text, 'NULL'));
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Case 7: no full_name in metadata → derived from e-mail prefix.
-- ---------------------------------------------------------------------------
do $$
declare
  _org uuid := current_setting('tt005a.org_id')::uuid;
  _uid uuid;
  _full_name text;
begin
  _uid := pg_temp.new_auth_user(
    'alan.turing@example.test',
    jsonb_build_object('organization_id', _org::text)
  );
  select full_name into _full_name from public.profiles where id = _uid;
  if _full_name is distinct from 'alan.turing' then
    perform pg_temp.fail('case 7: full_name should default to email prefix, got ' || coalesce(_full_name, 'NULL'));
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Case 8: pre-existing profile row must NOT be overwritten by the trigger.
-- Simulated by inserting the auth.users row first with metadata that would
-- create an inactive profile, then updating that profile to a distinct state
-- and firing the trigger again via a synthetic re-INSERT is not possible
-- (PK conflict). Instead, seed the profile BEFORE the auth insert by using
-- a manually chosen id and pre-seeding `public.profiles` with a marker
-- full_name — the trigger must observe the existing row and skip.
-- ---------------------------------------------------------------------------
do $$
declare
  _org uuid := current_setting('tt005a.org_id')::uuid;
  _uid uuid := gen_random_uuid();
  _full_name text;
  _status    public.profile_status;
begin
  -- Pre-seed profile with distinct values.
  insert into public.profiles (id, organization_id, full_name, status)
    values (_uid, _org, 'PRESEEDED', 'active');

  -- Now insert the corresponding auth.users row with metadata that WOULD
  -- have produced (inactive, 'Should Not Win'). The trigger must no-op.
  insert into auth.users (id, email, raw_user_meta_data)
    values (
      _uid,
      'tt005a-case8@example.test',
      jsonb_build_object('organization_id', _org::text, 'full_name', 'Should Not Win')
    );

  select full_name, status into _full_name, _status
    from public.profiles where id = _uid;

  if _full_name is distinct from 'PRESEEDED' then
    perform pg_temp.fail('case 8: trigger must not overwrite existing full_name, got ' || coalesce(_full_name, 'NULL'));
  end if;
  if _status is distinct from 'active'::public.profile_status then
    perform pg_temp.fail('case 8: trigger must not overwrite existing status, got ' || coalesce(_status::text, 'NULL'));
  end if;
end
$$;

do $$
begin
  raise notice 'TT-005 auto-profile-on-signup tests: ALL ASSERTIONS PASSED';
end
$$;

rollback;
