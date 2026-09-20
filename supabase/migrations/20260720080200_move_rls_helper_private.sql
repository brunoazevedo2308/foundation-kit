-- TT-004.2.1 — Move current_organization_id() out of the exposed API schema
--
-- Supabase's Data API (PostgREST) exposes the `public` schema. A
-- SECURITY DEFINER function living in `public` is flagged by the Security
-- Advisor because it becomes callable via the REST API (`POST /rpc/...`).
-- We move it to a private schema kept OUT of the API surface. RLS policies
-- reference the function by OID, so `ALTER FUNCTION ... SET SCHEMA` preserves
-- every existing policy without recreating it.
--
-- NOTE: All future references MUST use `private.current_organization_id()`.
-- The `public.current_organization_id()` name no longer exists after this
-- migration.

-- 1. Private schema (kept out of the Supabase API `exposed_schemas` list).
create schema if not exists private;

comment on schema private is
  'Internal helpers not exposed via PostgREST. Do NOT add this schema to '
  'the Supabase API exposed_schemas. Only SECURITY DEFINER helpers used '
  'by RLS policies belong here.';

-- 2. Lock the schema down: revoke public access, then grant USAGE to the
--    roles that need to resolve function names inside policy expressions.
revoke all on schema private from public;
revoke all on schema private from anon;
grant usage on schema private to authenticated;
grant usage on schema private to service_role;

-- 3. Move the helper. Existing policies reference the function by OID, so
--    they continue to work transparently after the schema move.
alter function public.current_organization_id() set schema private;

-- 4. Re-assert the hardened search_path on the moved function.
alter function private.current_organization_id() set search_path = pg_catalog, public, private;

-- 5. Restrict EXECUTE. Revoke from public/anon; grant only to the roles
--    that legitimately evaluate RLS policies.
revoke all on function private.current_organization_id() from public;
revoke all on function private.current_organization_id() from anon;
grant execute on function private.current_organization_id() to authenticated;
grant execute on function private.current_organization_id() to service_role;

comment on function private.current_organization_id() is
  'Returns the caller''s organization_id from public.profiles. '
  'SECURITY DEFINER; kept in the private schema so it is not exposed via '
  'PostgREST. Reference as private.current_organization_id() in future '
  'policies and migrations.';
