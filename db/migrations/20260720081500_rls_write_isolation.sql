-- TT-004.2 — RLS Write Isolation by Organization
--
-- INSERT/UPDATE policies scoped to public.current_organization_id().
-- No DELETE policies (physical delete blocked; use deleted_at soft-delete).
-- Cross-organization integrity enforced by BEFORE INSERT/UPDATE triggers.

-- ============================================================================
-- Cross-org integrity helpers
-- ============================================================================

create or replace function public.assert_same_org(_expected uuid, _actual uuid, _label text)
returns void
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
begin
  if _actual is null then
    return;
  end if;
  if _expected is null or _expected <> _actual then
    raise exception 'Cross-organization reference not allowed for %: expected %, got %',
      _label, _expected, _actual
      using errcode = '42501';
  end if;
end;
$$;

-- Per-table trigger functions ------------------------------------------------

create or replace function public.enforce_vessel_org_integrity()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_client_org uuid;
begin
  select organization_id into v_client_org from public.clients where id = new.client_id;
  perform public.assert_same_org(new.organization_id, v_client_org, 'vessel.client_id');
  return new;
end;
$$;

create or replace function public.enforce_action_org_integrity()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_org uuid;
begin
  if new.client_id is not null then
    select organization_id into v_org from public.clients where id = new.client_id;
    perform public.assert_same_org(new.organization_id, v_org, 'action.client_id');
  end if;
  if new.vessel_id is not null then
    select organization_id into v_org from public.vessels where id = new.vessel_id;
    perform public.assert_same_org(new.organization_id, v_org, 'action.vessel_id');
  end if;
  if new.responsible_user_id is not null then
    select organization_id into v_org from public.profiles where id = new.responsible_user_id;
    perform public.assert_same_org(new.organization_id, v_org, 'action.responsible_user_id');
  end if;
  if new.created_by is not null then
    select organization_id into v_org from public.profiles where id = new.created_by;
    perform public.assert_same_org(new.organization_id, v_org, 'action.created_by');
  end if;
  return new;
end;
$$;

create or replace function public.enforce_deliverable_org_integrity()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.actions where id = new.action_id;
  perform public.assert_same_org(new.organization_id, v_org, 'deliverable.action_id');
  if new.responsible_user_id is not null then
    select organization_id into v_org from public.profiles where id = new.responsible_user_id;
    perform public.assert_same_org(new.organization_id, v_org, 'deliverable.responsible_user_id');
  end if;
  if new.created_by is not null then
    select organization_id into v_org from public.profiles where id = new.created_by;
    perform public.assert_same_org(new.organization_id, v_org, 'deliverable.created_by');
  end if;
  return new;
end;
$$;

create or replace function public.enforce_evidence_org_integrity()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.deliverables where id = new.deliverable_id;
  perform public.assert_same_org(new.organization_id, v_org, 'evidence.deliverable_id');
  if new.uploaded_by is not null then
    select organization_id into v_org from public.profiles where id = new.uploaded_by;
    perform public.assert_same_org(new.organization_id, v_org, 'evidence.uploaded_by');
  end if;
  return new;
end;
$$;

create or replace function public.enforce_comment_org_integrity()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_org uuid;
begin
  if new.action_id is not null then
    select organization_id into v_org from public.actions where id = new.action_id;
    perform public.assert_same_org(new.organization_id, v_org, 'comment.action_id');
  end if;
  if new.deliverable_id is not null then
    select organization_id into v_org from public.deliverables where id = new.deliverable_id;
    perform public.assert_same_org(new.organization_id, v_org, 'comment.deliverable_id');
  end if;
  if new.author_user_id is not null then
    select organization_id into v_org from public.profiles where id = new.author_user_id;
    perform public.assert_same_org(new.organization_id, v_org, 'comment.author_user_id');
  end if;
  return new;
end;
$$;

create or replace function public.enforce_attachment_org_integrity()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_org uuid;
begin
  if new.action_id is not null then
    select organization_id into v_org from public.actions where id = new.action_id;
    perform public.assert_same_org(new.organization_id, v_org, 'attachment.action_id');
  end if;
  if new.deliverable_id is not null then
    select organization_id into v_org from public.deliverables where id = new.deliverable_id;
    perform public.assert_same_org(new.organization_id, v_org, 'attachment.deliverable_id');
  end if;
  if new.comment_id is not null then
    select organization_id into v_org from public.comments where id = new.comment_id;
    perform public.assert_same_org(new.organization_id, v_org, 'attachment.comment_id');
  end if;
  if new.uploaded_by is not null then
    select organization_id into v_org from public.profiles where id = new.uploaded_by;
    perform public.assert_same_org(new.organization_id, v_org, 'attachment.uploaded_by');
  end if;
  return new;
end;
$$;

create or replace function public.enforce_user_vessel_org_integrity()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.profiles where id = new.profile_id;
  perform public.assert_same_org(new.organization_id, v_org, 'user_vessels.profile_id');
  select organization_id into v_org from public.vessels where id = new.vessel_id;
  perform public.assert_same_org(new.organization_id, v_org, 'user_vessels.vessel_id');
  if new.assigned_by is not null then
    select organization_id into v_org from public.profiles where id = new.assigned_by;
    perform public.assert_same_org(new.organization_id, v_org, 'user_vessels.assigned_by');
  end if;
  return new;
end;
$$;

create or replace function public.enforce_notification_org_integrity()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.profiles where id = new.recipient_user_id;
  perform public.assert_same_org(new.organization_id, v_org, 'notification.recipient_user_id');
  if new.actor_user_id is not null then
    select organization_id into v_org from public.profiles where id = new.actor_user_id;
    perform public.assert_same_org(new.organization_id, v_org, 'notification.actor_user_id');
  end if;
  return new;
end;
$$;

-- Attach triggers ------------------------------------------------------------

create trigger trg_vessels_org_integrity
  before insert or update on public.vessels
  for each row execute function public.enforce_vessel_org_integrity();

create trigger trg_actions_org_integrity
  before insert or update on public.actions
  for each row execute function public.enforce_action_org_integrity();

create trigger trg_deliverables_org_integrity
  before insert or update on public.deliverables
  for each row execute function public.enforce_deliverable_org_integrity();

create trigger trg_evidences_org_integrity
  before insert or update on public.evidences
  for each row execute function public.enforce_evidence_org_integrity();

create trigger trg_comments_org_integrity
  before insert or update on public.comments
  for each row execute function public.enforce_comment_org_integrity();

create trigger trg_attachments_org_integrity
  before insert or update on public.attachments
  for each row execute function public.enforce_attachment_org_integrity();

create trigger trg_user_vessels_org_integrity
  before insert or update on public.user_vessels
  for each row execute function public.enforce_user_vessel_org_integrity();

create trigger trg_notifications_org_integrity
  before insert or update on public.notifications
  for each row execute function public.enforce_notification_org_integrity();

-- ============================================================================
-- WRITE POLICIES
-- ============================================================================

-- organizations: UPDATE own org only; no user INSERT.
create policy "organizations_update_own_org"
on public.organizations
for update
to authenticated
using (id = public.current_organization_id() and deleted_at is null)
with check (id = public.current_organization_id());

-- profiles: UPDATE own profile only; organization_id cannot change via RLS.
create policy "profiles_update_self"
on public.profiles
for update
to authenticated
using (
  id = auth.uid()
  and organization_id = public.current_organization_id()
  and deleted_at is null
)
with check (
  id = auth.uid()
  and organization_id = public.current_organization_id()
);

-- clients
create policy "clients_insert_same_org"
on public.clients for insert to authenticated
with check (organization_id = public.current_organization_id());

create policy "clients_update_same_org"
on public.clients for update to authenticated
using (organization_id = public.current_organization_id() and deleted_at is null)
with check (organization_id = public.current_organization_id());

-- vessels
create policy "vessels_insert_same_org"
on public.vessels for insert to authenticated
with check (organization_id = public.current_organization_id());

create policy "vessels_update_same_org"
on public.vessels for update to authenticated
using (organization_id = public.current_organization_id() and deleted_at is null)
with check (organization_id = public.current_organization_id());

-- actions
create policy "actions_insert_same_org"
on public.actions for insert to authenticated
with check (organization_id = public.current_organization_id());

create policy "actions_update_same_org"
on public.actions for update to authenticated
using (organization_id = public.current_organization_id() and deleted_at is null)
with check (organization_id = public.current_organization_id());

-- deliverables
create policy "deliverables_insert_same_org"
on public.deliverables for insert to authenticated
with check (organization_id = public.current_organization_id());

create policy "deliverables_update_same_org"
on public.deliverables for update to authenticated
using (organization_id = public.current_organization_id() and deleted_at is null)
with check (organization_id = public.current_organization_id());

-- evidences
create policy "evidences_insert_same_org"
on public.evidences for insert to authenticated
with check (organization_id = public.current_organization_id());

create policy "evidences_update_same_org"
on public.evidences for update to authenticated
using (organization_id = public.current_organization_id() and deleted_at is null)
with check (organization_id = public.current_organization_id());

-- comments
create policy "comments_insert_same_org"
on public.comments for insert to authenticated
with check (organization_id = public.current_organization_id());

create policy "comments_update_same_org"
on public.comments for update to authenticated
using (organization_id = public.current_organization_id() and deleted_at is null)
with check (organization_id = public.current_organization_id());

-- attachments
create policy "attachments_insert_same_org"
on public.attachments for insert to authenticated
with check (organization_id = public.current_organization_id());

create policy "attachments_update_same_org"
on public.attachments for update to authenticated
using (organization_id = public.current_organization_id() and deleted_at is null)
with check (organization_id = public.current_organization_id());

-- user_vessels (no deleted_at)
create policy "user_vessels_insert_same_org"
on public.user_vessels for insert to authenticated
with check (organization_id = public.current_organization_id());

create policy "user_vessels_update_same_org"
on public.user_vessels for update to authenticated
using (organization_id = public.current_organization_id())
with check (organization_id = public.current_organization_id());

-- notifications: INSERT scoped to org; UPDATE by recipient only, cannot
-- change recipient_user_id nor organization_id (WITH CHECK enforces both).
create policy "notifications_insert_same_org"
on public.notifications for insert to authenticated
with check (organization_id = public.current_organization_id());

create policy "notifications_update_recipient_only"
on public.notifications for update to authenticated
using (
  organization_id = public.current_organization_id()
  and recipient_user_id = auth.uid()
)
with check (
  organization_id = public.current_organization_id()
  and recipient_user_id = auth.uid()
);

-- audit_events: INSERT scoped to caller org; no UPDATE/DELETE (immutability
-- also enforced by prevent_audit_event_mutation triggers).
create policy "audit_events_insert_same_org"
on public.audit_events for insert to authenticated
with check (
  organization_id is not null
  and organization_id = public.current_organization_id()
);
