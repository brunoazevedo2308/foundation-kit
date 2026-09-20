-- DP Suite — US-004 comment ownership and soft-delete RLS regression test.
-- Development/Staging only. The transaction always rolls back.

begin;

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
  raise exception 'US-004 ASSERTION FAILED: %', _label;
end;
$$;

do $fixture$
declare
  v_org_a uuid := gen_random_uuid();
  v_org_b uuid := gen_random_uuid();
  v_member_a uuid := gen_random_uuid();
  v_member_a2 uuid := gen_random_uuid();
  v_admin_a uuid := gen_random_uuid();
  v_member_b uuid := gen_random_uuid();
  v_action_a uuid := gen_random_uuid();
  v_action_b uuid := gen_random_uuid();
  v_own_comment uuid := gen_random_uuid();
  v_other_comment uuid := gen_random_uuid();
  v_cross_comment uuid := gen_random_uuid();
begin
  insert into public.organizations (
    id, name, slug, legal_name, country_code, primary_email
  )
  values
    (
      v_org_a, 'US004 Org A', 'us004-org-a-' || substr(v_org_a::text, 1, 8),
      'US004 Org A Ltda.', 'BR', 'us004-org-a@test.local'
    ),
    (
      v_org_b, 'US004 Org B', 'us004-org-b-' || substr(v_org_b::text, 1, 8),
      'US004 Org B Ltda.', 'BR', 'us004-org-b@test.local'
    );

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  )
  select
    '00000000-0000-0000-0000-000000000000', user_id, 'authenticated', 'authenticated',
    email, '$2a$10$abcdefghijklmnopqrstuv', now(), '{}'::jsonb, '{}'::jsonb,
    now(), now(), '', '', '', ''
  from (values
    (v_member_a, 'us004-member-a@test.local'),
    (v_member_a2, 'us004-member-a2@test.local'),
    (v_admin_a, 'us004-admin-a@test.local'),
    (v_member_b, 'us004-member-b@test.local')
  ) as users(user_id, email);

  insert into public.profiles (id, organization_id, full_name, role, status)
  values
    (v_member_a, v_org_a, 'Member A', 'member', 'active'),
    (v_member_a2, v_org_a, 'Member A2', 'member', 'active'),
    (v_admin_a, v_org_a, 'Admin A', 'organization_admin', 'active'),
    (v_member_b, v_org_b, 'Member B', 'member', 'active');

  insert into public.actions (
    id, organization_id, title, responsible_user_id, created_by
  )
  values
    (v_action_a, v_org_a, 'US004 Action A', v_admin_a, v_admin_a),
    (v_action_b, v_org_b, 'US004 Action B', v_member_b, v_member_b);

  insert into public.comments (id, organization_id, action_id, author_user_id, body)
  values
    (v_own_comment, v_org_a, v_action_a, v_member_a, 'Own comment'),
    (v_other_comment, v_org_a, v_action_a, v_member_a2, 'Other member comment'),
    (v_cross_comment, v_org_b, v_action_b, v_member_b, 'Cross-organization comment');

  perform set_config('us004.member_a', v_member_a::text, true);
  perform set_config('us004.admin_a', v_admin_a::text, true);
  perform set_config('us004.own_comment', v_own_comment::text, true);
  perform set_config('us004.other_comment', v_other_comment::text, true);
  perform set_config('us004.cross_comment', v_cross_comment::text, true);
end;
$fixture$;

do $member_permissions$
declare
  v_member_a uuid := current_setting('us004.member_a')::uuid;
  v_own_comment uuid := current_setting('us004.own_comment')::uuid;
  v_other_comment uuid := current_setting('us004.other_comment')::uuid;
  v_cross_comment uuid := current_setting('us004.cross_comment')::uuid;
  v_count integer;
begin
  perform pg_temp.assume_user(v_member_a);

  update public.comments set deleted_at = now() where id = v_own_comment;
  get diagnostics v_count = row_count;
  if v_count <> 1 then perform pg_temp.fail('member cannot soft-delete own comment'); end if;

  select count(*) into v_count from public.comments where id = v_own_comment;
  if v_count <> 1 then perform pg_temp.fail('soft-deleted own comment is not visible to UPDATE RETURNING'); end if;

  update public.comments set deleted_at = now() where id = v_other_comment;
  get diagnostics v_count = row_count;
  if v_count <> 0 then perform pg_temp.fail('member soft-deleted another member comment'); end if;

  update public.comments set deleted_at = now() where id = v_cross_comment;
  get diagnostics v_count = row_count;
  if v_count <> 0 then perform pg_temp.fail('member soft-deleted a cross-organization comment'); end if;

  perform pg_temp.reset_role();
end;
$member_permissions$;

do $admin_permissions$
declare
  v_admin_a uuid := current_setting('us004.admin_a')::uuid;
  v_other_comment uuid := current_setting('us004.other_comment')::uuid;
  v_count integer;
begin
  perform pg_temp.assume_user(v_admin_a);
  update public.comments set deleted_at = now() where id = v_other_comment;
  get diagnostics v_count = row_count;
  if v_count <> 1 then perform pg_temp.fail('organization admin cannot moderate a comment'); end if;
  perform pg_temp.reset_role();
end;
$admin_permissions$;

do $$ begin raise notice 'US-004 comment permission tests: ALL ASSERTIONS PASSED'; end $$;

rollback;
