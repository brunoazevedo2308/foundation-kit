drop policy if exists actions_insert_same_org on public.actions;
drop policy if exists actions_update_same_org on public.actions;

create policy actions_insert_same_org
on public.actions
for insert
to authenticated
with check (
  organization_id = private.current_organization_id()
  and private.can_manage_operational_data()
);

create policy actions_update_same_org
on public.actions
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
