-- DP Suite — TT-005 follow-up
-- Auto-provision `public.profiles` row when a new `auth.users` row appears.
--
-- Context:
--   * A profile is what the app uses to gate access (see TT-005). Before this
--     migration, profiles had to be created manually after sign-up, which
--     opened a window in which a freshly signed-up user was authenticated
--     but had no profile row — indistinguishable from a `blocked` user.
--   * This migration installs an AFTER INSERT trigger on `auth.users` that
--     creates the matching profile row from the user's signup metadata.
--
-- Rules (backlog-approved terminology: active | inactive | blocked):
--   * A profile is created ONLY when the signup metadata carries a valid
--     `organization_id` referencing an existing, non-soft-deleted
--     `public.organizations` row. Without a valid org the trigger is a
--     no-op — no profile is created, so `fetchProfileStatus()` will
--     report `blocked` and the app will refuse access. This prevents
--     "orphan" users from ever gaining access.
--   * Default lifecycle status is `inactive`. The account requires
--     explicit activation by an admin before it can sign in.
--     A profile is created as `active` only when the metadata explicitly
--     sets `status` to `'active'` (e.g. self-service invitation flow that
--     has already validated the invitee).
--   * `full_name` comes from metadata `full_name` when present, otherwise
--     from the local-part of the e-mail (the substring before `@`).
--   * If a profile row already exists for the user (e.g. seeded manually
--     or created by a previous provisioning path) the trigger is a no-op
--     — it never overwrites an existing profile.
--
-- Security:
--   * Function lives in the `private` schema (not exposed via PostgREST).
--   * SECURITY DEFINER, owned by the migration role, with a fixed
--     `search_path = pg_catalog, public` to block search-path attacks.
--     DEFINER is required because the trigger fires from the `supabase_auth_admin`
--     role, which does not have INSERT privileges on `public.profiles`.
--   * The trigger inserts a single row keyed by `NEW.id` and derives every
--     value from `NEW`. It performs no other side-effects.
--
-- Idempotence:
--   * `create or replace function` + `drop trigger if exists` before
--     `create trigger` — safe to re-run in dev after a `db reset`.
--   * Guarded by `if not exists` where relevant.
--
-- NOTE: This migration has already been applied to Development externally.
-- Do NOT re-apply. It is committed for versioning and reproducibility only
-- (fresh environments and Staging/Production will pick it up in order).

-- -----------------------------------------------------------------------------
-- Function: private.handle_new_auth_user
-- -----------------------------------------------------------------------------
create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  _meta         jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  _org_raw      text  := nullif(_meta->>'organization_id', '');
  _org_id       uuid;
  _status_raw   text  := nullif(_meta->>'status', '');
  _status       public.profile_status := 'inactive';
  _full_name    text;
  _email_prefix text;
begin
  -- 1. Do not overwrite an existing profile row.
  if exists (select 1 from public.profiles where id = new.id) then
    return new;
  end if;

  -- 2. Require a valid organization_id in the signup metadata.
  --    Any parse failure or missing org is treated as "no org" and skips
  --    profile creation — the app will then report `blocked`.
  if _org_raw is null then
    return new;
  end if;
  begin
    _org_id := _org_raw::uuid;
  exception when others then
    return new;
  end;
  if not exists (
    select 1
      from public.organizations
     where id = _org_id
       and deleted_at is null
  ) then
    return new;
  end if;

  -- 3. Status: `inactive` by default, `active` ONLY when explicitly requested.
  --    Any other value (including 'blocked' from unsafe metadata) falls back
  --    to `inactive` — activation must be an explicit admin/invitation action.
  if _status_raw = 'active' then
    _status := 'active';
  end if;

  -- 4. full_name from metadata or from the e-mail local-part.
  _full_name := nullif(trim(coalesce(_meta->>'full_name', '')), '');
  if _full_name is null then
    _email_prefix := split_part(coalesce(new.email, ''), '@', 1);
    _full_name := nullif(_email_prefix, '');
  end if;

  insert into public.profiles (id, organization_id, full_name, status)
    values (new.id, _org_id, _full_name, _status)
    on conflict (id) do nothing;

  return new;
end;
$$;

comment on function private.handle_new_auth_user() is
  'AFTER INSERT trigger on auth.users. Creates public.profiles row only when '
  'signup metadata carries a valid organization_id. Default status=inactive; '
  'active only when metadata.status=''active''. full_name from metadata or '
  'email prefix. Never overwrites an existing profile row.';

-- Restrict EXECUTE: only the auth admin role (which owns the trigger) and
-- service_role should ever invoke it. authenticated / anon must not.
revoke all on function private.handle_new_auth_user() from public;
grant execute on function private.handle_new_auth_user() to service_role;

-- -----------------------------------------------------------------------------
-- Trigger: on_auth_user_created_create_profile
-- -----------------------------------------------------------------------------
drop trigger if exists on_auth_user_created_create_profile on auth.users;

create trigger on_auth_user_created_create_profile
  after insert on auth.users
  for each row execute function private.handle_new_auth_user();

comment on trigger on_auth_user_created_create_profile on auth.users is
  'Auto-provisions public.profiles for new auth.users when signup metadata '
  'includes a valid organization_id (TT-005 follow-up).';
