-- TT-004.1 — RLS Read Isolation Foundation
--
-- Introduces `public.current_organization_id()` and SELECT-only RLS policies
-- that scope reads to the caller's Organization. No write policies here.

-- ---------------------------------------------------------------------------
-- 1. Helper: current_organization_id()
-- ---------------------------------------------------------------------------

create or replace function public.current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select p.organization_id
  from public.profiles p
  where p.id = auth.uid()
    and p.deleted_at is null
  limit 1
$$;

revoke execute on function public.current_organization_id() from public;
grant execute on function public.current_organization_id() to authenticated;
grant execute on function public.current_organization_id() to service_role;

-- ---------------------------------------------------------------------------
-- 2. SELECT policies (read isolation by organization)
-- ---------------------------------------------------------------------------

-- organizations
create policy "organizations_select_own_org"
on public.organizations
for select
to authenticated
using (
  id = public.current_organization_id()
  and deleted_at is null
);

-- profiles
create policy "profiles_select_same_org"
on public.profiles
for select
to authenticated
using (
  organization_id = public.current_organization_id()
  and deleted_at is null
);

-- clients
create policy "clients_select_same_org"
on public.clients
for select
to authenticated
using (
  organization_id = public.current_organization_id()
  and deleted_at is null
);

-- vessels
create policy "vessels_select_same_org"
on public.vessels
for select
to authenticated
using (
  organization_id = public.current_organization_id()
  and deleted_at is null
);

-- actions
create policy "actions_select_same_org"
on public.actions
for select
to authenticated
using (
  organization_id = public.current_organization_id()
  and deleted_at is null
);

-- deliverables
create policy "deliverables_select_same_org"
on public.deliverables
for select
to authenticated
using (
  organization_id = public.current_organization_id()
  and deleted_at is null
);

-- evidences
create policy "evidences_select_same_org"
on public.evidences
for select
to authenticated
using (
  organization_id = public.current_organization_id()
  and deleted_at is null
);

-- comments
create policy "comments_select_same_org"
on public.comments
for select
to authenticated
using (
  organization_id = public.current_organization_id()
  and deleted_at is null
);

-- attachments
create policy "attachments_select_same_org"
on public.attachments
for select
to authenticated
using (
  organization_id = public.current_organization_id()
  and deleted_at is null
);

-- user_vessels (no deleted_at column)
create policy "user_vessels_select_same_org"
on public.user_vessels
for select
to authenticated
using (
  organization_id = public.current_organization_id()
);

-- notifications: scoped to organization AND the recipient user
create policy "notifications_select_own_recipient"
on public.notifications
for select
to authenticated
using (
  organization_id = public.current_organization_id()
  and recipient_user_id = auth.uid()
);

-- audit_events: only rows within the caller's organization; global events
-- (organization_id is null) are NOT visible to regular users.
create policy "audit_events_select_same_org"
on public.audit_events
for select
to authenticated
using (
  organization_id is not null
  and organization_id = public.current_organization_id()
);
