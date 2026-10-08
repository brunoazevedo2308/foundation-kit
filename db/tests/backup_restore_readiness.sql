-- DP Suite — read-only readiness check for a restored Supabase database.
--
-- Run only after the restore has completed. The transaction makes the
-- no-write intent explicit and the final ROLLBACK leaves the target unchanged.

begin read only;

do $$
declare
  missing_tables text[];
  tables_without_rls text[];
  missing_buckets text[];
  migration_count integer;
  latest_migration text;
begin
  with expected(name) as (
    values
      ('organizations'),
      ('profiles'),
      ('clients'),
      ('vessels'),
      ('actions'),
      ('deliverables'),
      ('user_vessels'),
      ('evidences'),
      ('comments'),
      ('attachments'),
      ('notifications'),
      ('audit_events')
  )
  select array_agg(expected.name order by expected.name)
    into missing_tables
  from expected
  left join pg_class c
    on c.relname = expected.name
   and c.relkind = 'r'
  left join pg_namespace n
    on n.oid = c.relnamespace
   and n.nspname = 'public'
  where n.oid is null;

  if coalesce(cardinality(missing_tables), 0) > 0 then
    raise exception 'Missing public tables: %', missing_tables;
  end if;

  with expected(name) as (
    values
      ('organizations'),
      ('profiles'),
      ('clients'),
      ('vessels'),
      ('actions'),
      ('deliverables'),
      ('user_vessels'),
      ('evidences'),
      ('comments'),
      ('attachments'),
      ('notifications'),
      ('audit_events')
  )
  select array_agg(c.relname order by c.relname)
    into tables_without_rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join expected on expected.name = c.relname
  where n.nspname = 'public'
    and c.relkind = 'r'
    and not c.relrowsecurity;

  if coalesce(cardinality(tables_without_rls), 0) > 0 then
    raise exception 'Public tables without RLS: %', tables_without_rls;
  end if;

  select count(*), max(version)
    into migration_count, latest_migration
  from supabase_migrations.schema_migrations;

  if migration_count <> 32 or latest_migration <> '20260919222852' then
    raise exception 'Unexpected migration state: count=%, latest=%',
      migration_count,
      latest_migration;
  end if;

  with expected(id) as (
    values ('evidences-private'), ('attachments-private')
  )
  select array_agg(expected.id order by expected.id)
    into missing_buckets
  from expected
  left join storage.buckets using (id)
  where storage.buckets.id is null;

  if coalesce(cardinality(missing_buckets), 0) > 0 then
    raise exception 'Missing private buckets: %', missing_buckets;
  end if;
end
$$;

select json_build_object(
  'status', 'ok',
  'migration_count', (select count(*) from supabase_migrations.schema_migrations),
  'latest_migration', (select max(version) from supabase_migrations.schema_migrations),
  'auth_user_count', (select count(*) from auth.users),
  'organization_count', (select count(*) from public.organizations),
  'storage_object_count', (select count(*) from storage.objects)
) as backup_restore_readiness;

rollback;

