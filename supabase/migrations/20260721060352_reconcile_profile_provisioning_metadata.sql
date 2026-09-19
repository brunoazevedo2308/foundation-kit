-- DP Suite — TT-005 follow-up (reconciliation)
-- Align the versioned migration with the function currently live in
-- Development: the metadata key for lifecycle status is `profile_status`,
-- with `status` accepted as a legacy fallback for backward compatibility.
--
-- Why a separate migration:
--   * Migration `20260720084000_auto_create_profile_on_signup.sql` shipped
--     using metadata key `status` only. The applied version in Development
--     was subsequently tightened to read `profile_status` first and fall
--     back to `status`.
--   * Migrations are immutable once applied — the fix ships as a new
--     migration that redefines the function in place. The trigger keeps
--     pointing at `private.handle_new_auth_user`, so no trigger churn.
--
-- Behavior (unchanged parts):
--   * Only creates a profile when metadata carries a valid organization_id
--     referencing a non-soft-deleted organization.
--   * Default status = 'inactive'. `active` only when the metadata value is
--     literally 'active'. Any other value (including 'blocked') falls back
--     to 'inactive'.
--   * `full_name` from metadata or e-mail local-part.
--   * Never overwrites an existing profile row.
--
-- Behavior (this migration changes):
--   * The lifecycle-status key read from `raw_user_meta_data` is now
--     `profile_status` (preferred). If absent, `status` is read as a
--     fallback so pre-existing signup flows keep working.
--
-- NOTE: This migration has already been applied to Development externally.
-- Committed for versioning only; fresh envs will pick it up in order.

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
  -- Preferred key: `profile_status`. Fallback (legacy): `status`.
  _status_raw   text  := coalesce(
                           nullif(_meta->>'profile_status', ''),
                           nullif(_meta->>'status', '')
                         );
  _status       public.profile_status := 'inactive';
  _full_name    text;
  _email_prefix text;
begin
  if exists (select 1 from public.profiles where id = new.id) then
    return new;
  end if;

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

  if _status_raw = 'active' then
    _status := 'active';
  end if;

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
  'active only when metadata.profile_status=''active'' (fallback: metadata.status). '
  'full_name from metadata or email prefix. Never overwrites an existing profile row.';

revoke all on function private.handle_new_auth_user() from public;
grant execute on function private.handle_new_auth_user() to service_role;
