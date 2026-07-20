-- DP Suite — TT-004.3
-- Reproducible RLS isolation test for Organization tenancy.
--
-- Usage:
--   * Development or Staging ONLY. NEVER run against Production.
--   * Run in the Supabase SQL Editor or via psql as a privileged role
--     (service_role / postgres). The whole script is wrapped in a
--     transaction that always ends in ROLLBACK, so no data persists
--     even when every assertion passes.
--
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f db/tests/tt004_organization_isolation.sql
--
--   In the SQL Editor: paste the file contents and click Run. If any
--   assertion fails the script raises an exception and rolls back.
--
-- What it verifies (TT-004.1 + TT-004.2):
--   * SELECT isolation by organization (positive + negative).
--   * INSERT / UPDATE isolation by organization (positive + negative).
--   * Cross-organization FK integrity for `actions` (client/vessel/responsible).
--   * No DELETE policy is exposed to `authenticated`.
--   * `audit_events` rejects UPDATE and DELETE (immutability trigger).
--
-- NOT a schema change. This file is not a migration and MUST NOT be
-- placed under db/migrations/.

begin;

-- ---------------------------------------------------------------------------
-- 0. Local helpers (temporary — dropped by ROLLBACK).
-- ---------------------------------------------------------------------------

-- Impersonate an authenticated Supabase user in the current transaction.
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

-- Drop impersonation and go back to the privileged bootstrap role.
create or replace function pg_temp.reset_role()
returns void
language plpgsql
as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- Fail loudly with a labeled message.
create or replace function pg_temp.fail(_label text)
returns void
language plpgsql
as $$
begin
  raise exception 'TT-004.3 ASSERTION FAILED: %', _label;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Fixture data (created as the privileged bootstrap role).
-- ---------------------------------------------------------------------------

do $fixture$
declare
  v_org_a uuid := gen_random_uuid();
  v_org_b uuid := gen_random_uuid();
  v_user_a uuid := gen_random_uuid();
  v_user_b uuid := gen_random_uuid();
  v_client_a uuid := gen_random_uuid();
  v_client_b uuid := gen_random_uuid();
  v_vessel_a uuid := gen_random_uuid();
  v_vessel_b uuid := gen_random_uuid();
begin
  -- Organizations
  insert into public.organizations (id, name, slug)
  values (v_org_a, 'TT004 Org A', 'tt004-org-a-' || substr(v_org_a::text, 1, 8)),
         (v_org_b, 'TT004 Org B', 'tt004-org-b-' || substr(v_org_b::text, 1, 8));

  -- auth.users (minimal Supabase-compatible shape)
  insert into auth.users (
    instance_id, id, aud, role, email,
    encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) values
    ('00000000-0000-0000-0000-000000000000', v_user_a, 'authenticated', 'authenticated',
     'tt004-user-a-' || substr(v_user_a::text, 1, 8) || '@test.local',
     '$2a$10$abcdefghijklmnopqrstuv', now(), '{}'::jsonb, '{}'::jsonb,
     now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', v_user_b, 'authenticated', 'authenticated',
     'tt004-user-b-' || substr(v_user_b::text, 1, 8) || '@test.local',
     '$2a$10$abcdefghijklmnopqrstuv', now(), '{}'::jsonb, '{}'::jsonb,
     now(), now(), '', '', '', '');

  -- Profiles
  insert into public.profiles (id, organization_id, full_name)
  values (v_user_a, v_org_a, 'TT004 User A'),
         (v_user_b, v_org_b, 'TT004 User B');

  -- Clients
  insert into public.clients (id, organization_id, name, code)
  values (v_client_a, v_org_a, 'Client A', 'CLIA'),
         (v_client_b, v_org_b, 'Client B', 'CLIB');

  -- Vessels
  insert into public.vessels (id, organization_id, client_id, name, status)
  values (v_vessel_a, v_org_a, v_client_a, 'Vessel A', 'active'),
         (v_vessel_b, v_org_b, v_client_b, 'Vessel B', 'active');

  -- Stash into settings so downstream blocks can read the same IDs.
  perform set_config('tt004.org_a', v_org_a::text, true);
  perform set_config('tt004.org_b', v_org_b::text, true);
  perform set_config('tt004.user_a', v_user_a::text, true);
  perform set_config('tt004.user_b', v_user_b::text, true);
  perform set_config('tt004.client_a', v_client_a::text, true);
  perform set_config('tt004.client_b', v_client_b::text, true);
  perform set_config('tt004.vessel_a', v_vessel_a::text, true);
  perform set_config('tt004.vessel_b', v_vessel_b::text, true);
end;
$fixture$;

-- ---------------------------------------------------------------------------
-- 2. Positive cases — User A on Organization A.
-- ---------------------------------------------------------------------------

do $positive$
declare
  v_user_a uuid := current_setting('tt004.user_a')::uuid;
  v_org_a  uuid := current_setting('tt004.org_a')::uuid;
  v_client_a uuid := current_setting('tt004.client_a')::uuid;
  v_vessel_a uuid := current_setting('tt004.vessel_a')::uuid;
  v_count int;
  v_new_action uuid;
begin
  perform pg_temp.assume_user(v_user_a);

  -- SELECT own org rows
  select count(*) into v_count from public.organizations where id = v_org_a;
  if v_count <> 1 then perform pg_temp.fail('User A cannot SELECT own organization'); end if;

  select count(*) into v_count from public.clients where id = v_client_a;
  if v_count <> 1 then perform pg_temp.fail('User A cannot SELECT own client'); end if;

  select count(*) into v_count from public.vessels where id = v_vessel_a;
  if v_count <> 1 then perform pg_temp.fail('User A cannot SELECT own vessel'); end if;

  -- INSERT into own org
  insert into public.actions (
    organization_id, client_id, vessel_id, title,
    responsible_user_id, created_by
  ) values (
    v_org_a, v_client_a, v_vessel_a, 'Action A-positive',
    v_user_a, v_user_a
  ) returning id into v_new_action;

  if v_new_action is null then perform pg_temp.fail('User A INSERT action returned NULL id'); end if;

  -- UPDATE own row
  update public.actions
     set description = 'edited by A'
   where id = v_new_action;

  select count(*) into v_count
    from public.actions
   where id = v_new_action and description = 'edited by A';
  if v_count <> 1 then perform pg_temp.fail('User A UPDATE of own action did not persist'); end if;

  perform pg_temp.reset_role();
end;
$positive$;

-- ---------------------------------------------------------------------------
-- 3. Negative cases — User A must NOT see or touch Organization B.
-- ---------------------------------------------------------------------------

do $negative_read$
declare
  v_user_a uuid := current_setting('tt004.user_a')::uuid;
  v_org_b  uuid := current_setting('tt004.org_b')::uuid;
  v_client_b uuid := current_setting('tt004.client_b')::uuid;
  v_vessel_b uuid := current_setting('tt004.vessel_b')::uuid;
  v_count int;
begin
  perform pg_temp.assume_user(v_user_a);

  select count(*) into v_count from public.organizations where id = v_org_b;
  if v_count <> 0 then perform pg_temp.fail('User A leaked SELECT on Org B organization'); end if;

  select count(*) into v_count from public.clients where id = v_client_b;
  if v_count <> 0 then perform pg_temp.fail('User A leaked SELECT on Org B client (by id)'); end if;

  select count(*) into v_count from public.vessels where id = v_vessel_b;
  if v_count <> 0 then perform pg_temp.fail('User A leaked SELECT on Org B vessel (by id)'); end if;

  -- Broad SELECT must not surface Org B data even without filters.
  select count(*) into v_count
    from public.clients
   where organization_id = v_org_b;
  if v_count <> 0 then perform pg_temp.fail('User A leaked SELECT scanning Org B clients'); end if;

  perform pg_temp.reset_role();
end;
$negative_read$;

do $negative_insert$
declare
  v_user_a uuid := current_setting('tt004.user_a')::uuid;
  v_org_b  uuid := current_setting('tt004.org_b')::uuid;
  v_raised boolean := false;
begin
  perform pg_temp.assume_user(v_user_a);

  begin
    insert into public.clients (organization_id, name, code)
    values (v_org_b, 'Illegal cross-org client', 'X');
  exception when others then
    v_raised := true;
  end;

  if not v_raised then perform pg_temp.fail('User A was allowed to INSERT into Org B'); end if;

  perform pg_temp.reset_role();
end;
$negative_insert$;

do $negative_update$
declare
  v_user_a uuid := current_setting('tt004.user_a')::uuid;
  v_client_b uuid := current_setting('tt004.client_b')::uuid;
  v_count int;
begin
  perform pg_temp.assume_user(v_user_a);

  -- RLS silently filters: 0 rows affected, no error.
  update public.clients
     set name = 'hijacked by A'
   where id = v_client_b;
  get diagnostics v_count = row_count;
  if v_count <> 0 then perform pg_temp.fail('User A UPDATE on Org B affected rows'); end if;

  -- Confirm value not changed by reading as privileged role.
  perform pg_temp.reset_role();
  select count(*) into v_count
    from public.clients
   where id = v_client_b and name = 'Client B';
  if v_count <> 1 then perform pg_temp.fail('Org B client name was mutated by User A UPDATE'); end if;
end;
$negative_update$;

-- ---------------------------------------------------------------------------
-- 4. Cross-organization integrity on `actions`.
--    Action in Org A cannot reference Client / Vessel / Responsible in Org B.
-- ---------------------------------------------------------------------------

do $cross_org$
declare
  v_user_a uuid := current_setting('tt004.user_a')::uuid;
  v_user_b uuid := current_setting('tt004.user_b')::uuid;
  v_org_a  uuid := current_setting('tt004.org_a')::uuid;
  v_client_b uuid := current_setting('tt004.client_b')::uuid;
  v_vessel_b uuid := current_setting('tt004.vessel_b')::uuid;
  v_raised boolean;
begin
  perform pg_temp.assume_user(v_user_a);

  -- Client from Org B
  v_raised := false;
  begin
    insert into public.actions (organization_id, client_id, title, responsible_user_id, created_by)
    values (v_org_a, v_client_b, 'xorg-client', v_user_a, v_user_a);
  exception when others then v_raised := true; end;
  if not v_raised then perform pg_temp.fail('Action in A accepted client from B'); end if;

  -- Vessel from Org B
  v_raised := false;
  begin
    insert into public.actions (organization_id, vessel_id, title, responsible_user_id, created_by)
    values (v_org_a, v_vessel_b, 'xorg-vessel', v_user_a, v_user_a);
  exception when others then v_raised := true; end;
  if not v_raised then perform pg_temp.fail('Action in A accepted vessel from B'); end if;

  -- Responsible from Org B
  v_raised := false;
  begin
    insert into public.actions (organization_id, title, responsible_user_id, created_by)
    values (v_org_a, 'xorg-responsible', v_user_b, v_user_a);
  exception when others then v_raised := true; end;
  if not v_raised then perform pg_temp.fail('Action in A accepted responsible from B'); end if;

  perform pg_temp.reset_role();
end;
$cross_org$;

-- ---------------------------------------------------------------------------
-- 5. DELETE is not exposed to `authenticated` on any tenant table.
-- ---------------------------------------------------------------------------

do $no_delete$
declare
  v_user_a uuid := current_setting('tt004.user_a')::uuid;
  v_client_a uuid := current_setting('tt004.client_a')::uuid;
  v_count int;
begin
  perform pg_temp.assume_user(v_user_a);

  delete from public.clients where id = v_client_a;
  get diagnostics v_count = row_count;
  if v_count <> 0 then perform pg_temp.fail('DELETE on clients affected rows for authenticated user'); end if;

  perform pg_temp.reset_role();

  -- Row must still exist.
  select count(*) into v_count from public.clients where id = v_client_a;
  if v_count <> 1 then perform pg_temp.fail('Client A disappeared after DELETE attempt'); end if;

  -- Verify no DELETE policy exists for `authenticated` on the core tables.
  select count(*) into v_count
    from pg_policies
   where schemaname = 'public'
     and cmd = 'DELETE'
     and 'authenticated' = any(roles)
     and tablename in (
       'organizations','profiles','clients','vessels','actions',
       'deliverables','evidences','comments','attachments',
       'user_vessels','notifications','audit_events'
     );
  if v_count <> 0 then
    perform pg_temp.fail('Unexpected DELETE policy(ies) exist for authenticated');
  end if;
end;
$no_delete$;

-- ---------------------------------------------------------------------------
-- 6. audit_events immutability (UPDATE + DELETE are blocked by trigger).
--    Tested as the privileged role so RLS does not mask trigger behavior.
-- ---------------------------------------------------------------------------

do $audit_immutable$
declare
  v_org_a uuid := current_setting('tt004.org_a')::uuid;
  v_user_a uuid := current_setting('tt004.user_a')::uuid;
  v_event uuid;
  v_raised boolean;
begin
  insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id)
  values (v_org_a, v_user_a, 'tt004.test', 'test', gen_random_uuid())
  returning id into v_event;

  v_raised := false;
  begin
    update public.audit_events set action = 'tampered' where id = v_event;
  exception when others then v_raised := true; end;
  if not v_raised then perform pg_temp.fail('audit_events accepted UPDATE'); end if;

  v_raised := false;
  begin
    delete from public.audit_events where id = v_event;
  exception when others then v_raised := true; end;
  if not v_raised then perform pg_temp.fail('audit_events accepted DELETE'); end if;
end;
$audit_immutable$;

-- ---------------------------------------------------------------------------
-- 7. All good — surface a friendly notice and roll back everything.
-- ---------------------------------------------------------------------------

do $$ begin raise notice 'TT-004.3 organization isolation tests: ALL ASSERTIONS PASSED'; end $$;

rollback;
