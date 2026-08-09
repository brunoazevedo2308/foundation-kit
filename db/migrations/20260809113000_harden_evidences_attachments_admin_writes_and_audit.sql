drop policy if exists evidences_insert_authorized_deliverable on public.evidences;
create policy evidences_insert_authorized_deliverable
on public.evidences
for insert
to authenticated
with check (
  organization_id = private.current_organization_id()
  and private.can_manage_operational_data()
  and uploaded_by = auth.uid()
  and exists (
    select 1
    from public.deliverables d
    join public.actions a on a.id = d.action_id
    where d.id = evidences.deliverable_id
      and d.organization_id = evidences.organization_id
      and d.deleted_at is null
      and a.organization_id = evidences.organization_id
      and a.deleted_at is null
  )
);

drop policy if exists evidences_update_same_org on public.evidences;
create policy evidences_update_same_org
on public.evidences
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

drop policy if exists attachments_insert_same_org on public.attachments;
create policy attachments_insert_same_org
on public.attachments
for insert
to authenticated
with check (
  organization_id = private.current_organization_id()
  and private.can_manage_operational_data()
  and uploaded_by = auth.uid()
);

drop policy if exists attachments_update_same_org on public.attachments;
create policy attachments_update_same_org
on public.attachments
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

create or replace function private.audit_evidence_attachment_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_entity text;
  v_event text;
begin
  v_entity := case TG_TABLE_NAME when 'evidences' then 'evidence' else 'attachment' end;
  v_event := case when old.deleted_at is null and new.deleted_at is not null
    then v_entity || '.soft_deleted'
    else v_entity || '.updated'
  end;

  insert into public.audit_events (
    organization_id, actor_user_id, entity_type, entity_id, event_type, event_data
  ) values (
    new.organization_id,
    auth.uid(),
    v_entity,
    new.id,
    v_event,
    jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new))
  );
  return new;
end;
$$;

revoke all on function private.audit_evidence_attachment_change() from public, anon, authenticated;
grant execute on function private.audit_evidence_attachment_change() to postgres, service_role;

drop trigger if exists trg_evidences_audit_change on public.evidences;
create trigger trg_evidences_audit_change
after update on public.evidences
for each row execute function private.audit_evidence_attachment_change();

drop trigger if exists trg_attachments_audit_change on public.attachments;
create trigger trg_attachments_audit_change
after update on public.attachments
for each row execute function private.audit_evidence_attachment_change();
