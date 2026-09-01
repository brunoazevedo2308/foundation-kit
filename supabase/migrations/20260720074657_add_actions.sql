-- DP Suite — TT-003.3
-- Versioned migration: actions.
--
-- Apply after 20260720074347_add_clients_vessels.sql:
--   supabase link --project-ref lyxonmqsldtsixdhcaww
--   supabase db push
--
-- Scope:
--   * Create `public.actions` only.
--   * Reuse `public.set_updated_at()` created by TT-003.1.
--   * Standard timestamps + soft-delete columns.
--   * Enable RLS on the table so it stays LOCKED BY DEFAULT.
--     Policies are introduced in TT-004.
--
-- NOT in scope: RLS policies, seed data, additional business tables.

-- =============================================================================
-- Table: public.actions
-- =============================================================================
create table public.actions (
  id                       uuid primary key default gen_random_uuid(),
  organization_id          uuid not null
                             references public.organizations(id) on delete restrict,
  client_id                uuid
                             references public.clients(id) on delete restrict,
  vessel_id                uuid
                             references public.vessels(id) on delete restrict,
  title                    text not null,
  description              text,
  origin                   text,
  action_type              text,
  responsible_user_id      uuid not null
                             references public.profiles(id) on delete restrict,
  execution_priority         text not null default 'medium',
  operational_criticality  text not null default 'medium',
  status                   text not null default 'open',
  situation                text not null default 'no_blockers',
  due_date                 date,
  completed_at             timestamptz,
  created_by               uuid not null
                             references public.profiles(id) on delete restrict,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  deleted_at               timestamptz,

  constraint actions_execution_priority_check
    check (execution_priority in ('low', 'medium', 'high', 'urgent')),

  constraint actions_operational_criticality_check
    check (operational_criticality in ('low', 'medium', 'high', 'critical')),

  constraint actions_status_check
    check (status in ('open', 'planning', 'in_progress', 'in_review', 'awaiting_approval', 'completed', 'cancelled')),

  constraint actions_situation_check
    check (situation in ('no_blockers', 'awaiting_vessel', 'awaiting_client', 'awaiting_internal_team', 'awaiting_supplier', 'awaiting_document', 'awaiting_approval', 'under_analysis', 'under_execution')),

  constraint actions_completed_at_consistency_check
    check (
      (status = 'completed' and completed_at is not null)
      or
      (status <> 'completed' and completed_at is null)
    )
);

comment on table public.actions is
  'Action items (tasks, follow-ups, CAPAs) tracked within an organization for DP governance.';

comment on column public.actions.organization_id is
  'Owning organization (tenant scope). Restrict delete to protect referential integrity.';
comment on column public.actions.client_id is
  'Optional linked client. Restrict delete so dependent actions must be reassigned first.';
comment on column public.actions.vessel_id is
  'Optional linked vessel. Restrict delete so dependent actions must be reassigned first.';
comment on column public.actions.responsible_user_id is
  'Profile of the user accountable for executing the action.';
comment on column public.actions.created_by is
  'Profile of the user who created the action.';
comment on column public.actions.execution_priority is
  'Urgency of scheduling/response: low | medium | high | urgent. Drives queue order.';
comment on column public.actions.operational_criticality is
  'Operational impact on DP safety/compliance: low | medium | high | critical. Drives escalation.';
comment on column public.actions.status is
  'Lifecycle state of the action (open, planning, in_progress, in_review, awaiting_approval, completed, cancelled).';
comment on column public.actions.situation is
  'Current blocking/waiting context (no_blockers, awaiting_vessel, awaiting_client, etc.). Independent from status.';
comment on column public.actions.due_date is
  'Calendar date by which the action should be completed.';
comment on column public.actions.completed_at is
  'Timestamp when status became completed. Must be NULL for every other status.';
comment on column public.actions.deleted_at is
  'Soft-delete marker. NULL = active row.';

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index actions_organization_id_idx
  on public.actions (organization_id)
  where deleted_at is null;

create index actions_client_id_idx
  on public.actions (client_id)
  where deleted_at is null;

create index actions_vessel_id_idx
  on public.actions (vessel_id)
  where deleted_at is null;

create index actions_responsible_user_id_idx
  on public.actions (responsible_user_id)
  where deleted_at is null;

create index actions_status_idx
  on public.actions (status)
  where deleted_at is null;

create index actions_due_date_idx
  on public.actions (due_date)
  where deleted_at is null;

-- Active actions scoped by organization and status for list views.
create index actions_active_organization_status_idx
  on public.actions (organization_id, status)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Trigger
-- ---------------------------------------------------------------------------
create trigger actions_set_updated_at
  before update on public.actions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Grants and RLS
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.actions to authenticated;
grant all on public.actions to service_role;

alter table public.actions enable row level security;
