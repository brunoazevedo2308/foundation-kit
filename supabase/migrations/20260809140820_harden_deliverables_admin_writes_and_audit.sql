-- Mirror of the migration already applied to Supabase Development as
-- 20260809140820_harden_deliverables_admin_writes_and_audit.

drop policy if exists deliverables_insert_same_org on public.deliverables;
create policy deliverables_insert_same_org
on public.deliverables
for insert
to authenticated
with check (
  organization_id = private.current_organization_id()
  and private.can_manage_operational_data()
);

drop policy if exists deliverables_update_same_org on public.deliverables;
create policy deliverables_update_same_org
on public.deliverables
for update
to authenticated
using (
  organization_id = private.current_organization_id()
  and deleted_at is null
  and private.can_manage_operational_data()
)
with check (
  organization_id = private.current_organization_id()
  and private.can_manage_operational_data()
);

create or replace function private.audit_deliverable_change()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_event_type text;
  v_event_data jsonb;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if old.deleted_at is null and new.deleted_at is not null then
    v_event_type := 'deliverable.soft_deleted';
  else
    v_event_type := 'deliverable.updated';
  end if;

  v_event_data := jsonb_strip_nulls(jsonb_build_object(
    'action_id', new.action_id,
    'title', new.title,
    'status', new.status,
    'due_date', new.due_date,
    'responsible_user_id', new.responsible_user_id,
    'sequence_number', new.sequence_number,
    'completed_at', new.completed_at,
    'deleted_at', new.deleted_at
  ));

  insert into public.audit_events (
    organization_id,
    actor_user_id,
    entity_type,
    entity_id,
    event_type,
    event_data
  ) values (
    new.organization_id,
    auth.uid(),
    'deliverable',
    new.id,
    v_event_type,
    v_event_data
  );

  return new;
end;
$$;

revoke all on function private.audit_deliverable_change() from public, anon, authenticated;

drop trigger if exists trg_deliverables_audit_change on public.deliverables;
create trigger trg_deliverables_audit_change
after update on public.deliverables
for each row execute function private.audit_deliverable_change();
