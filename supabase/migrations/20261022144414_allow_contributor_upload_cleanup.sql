-- Permite que o responsável que iniciou um upload faça somente a limpeza
-- compensatória do próprio metadata quando o envio ao Storage falhar.
-- Administradores preservam as permissões atuais; colaboradores continuam
-- impedidos de editar qualquer outro campo.

create or replace function private.guard_contributor_upload_cleanup()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $$
begin
  if private.can_manage_operational_data() then
    return new;
  end if;

  if auth.uid() is null
    or old.uploaded_by is distinct from auth.uid()
    or new.uploaded_by is distinct from old.uploaded_by
    or old.deleted_at is not null
    or new.deleted_at is null
    or (to_jsonb(new) - 'deleted_at' - 'updated_at')
       is distinct from
       (to_jsonb(old) - 'deleted_at' - 'updated_at')
  then
    raise exception 'Only the uploader cleanup marker may be changed'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.guard_contributor_upload_cleanup()
  from public, anon, authenticated;
grant execute on function private.guard_contributor_upload_cleanup()
  to postgres, service_role;

create trigger evidences_guard_contributor_cleanup
before update on public.evidences
for each row execute function private.guard_contributor_upload_cleanup();

create trigger attachments_guard_contributor_cleanup
before update on public.attachments
for each row execute function private.guard_contributor_upload_cleanup();

drop policy if exists evidences_update_same_org on public.evidences;
create policy evidences_update_same_org
on public.evidences for update to authenticated
using (
  organization_id = (select private.current_organization_id())
  and deleted_at is null
  and (
    (select private.can_manage_operational_data())
    or uploaded_by = (select auth.uid())
  )
)
with check (
  organization_id = (select private.current_organization_id())
  and (
    (select private.can_manage_operational_data())
    or uploaded_by = (select auth.uid())
  )
);

drop policy if exists attachments_update_same_org on public.attachments;
create policy attachments_update_same_org
on public.attachments for update to authenticated
using (
  organization_id = (select private.current_organization_id())
  and deleted_at is null
  and (
    (select private.can_manage_operational_data())
    or uploaded_by = (select auth.uid())
  )
)
with check (
  organization_id = (select private.current_organization_id())
  and (
    (select private.can_manage_operational_data())
    or uploaded_by = (select auth.uid())
  )
);
