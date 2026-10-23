-- PostgREST validates UPDATE ... RETURNING rows against the table SELECT
-- policy. A soft-delete changes deleted_at before RETURNING is evaluated, so
-- administrators must remain able to select that same-organization row for
-- the update to complete. Ordinary users continue to see active rows only.

drop policy if exists clients_select_same_org on public.clients;
create policy clients_select_same_org
on public.clients
for select
to authenticated
using (
  organization_id = (select private.current_organization_id())
  and (
    deleted_at is null
    or (select private.can_manage_operational_data())
  )
);

drop policy if exists vessels_select_same_org on public.vessels;
create policy vessels_select_same_org
on public.vessels
for select
to authenticated
using (
  organization_id = (select private.current_organization_id())
  and (
    deleted_at is null
    or (select private.can_manage_operational_data())
  )
);

drop policy if exists actions_select_same_org on public.actions;
create policy actions_select_same_org
on public.actions
for select
to authenticated
using (
  organization_id = (select private.current_organization_id())
  and (
    deleted_at is null
    or (select private.can_manage_operational_data())
  )
);

drop policy if exists deliverables_select_same_org on public.deliverables;
create policy deliverables_select_same_org
on public.deliverables
for select
to authenticated
using (
  organization_id = (select private.current_organization_id())
  and (
    deleted_at is null
    or (select private.can_manage_operational_data())
  )
);
