-- DP Suite — TT-003.4
-- Versioned migration: deliverables.
--
-- Apply after 20260720075000_add_actions.sql:
--   supabase link --project-ref lyxonmqsldtsixdhcaww
--   supabase db push
--
-- Scope:
--   * Create `public.deliverables` only.
--   * Reuse `public.set_updated_at()` created by TT-003.1.
--   * Standard timestamps + soft-delete columns.
--   * Enable RLS on the table so it stays LOCKED BY DEFAULT.
--     Policies are introduced in TT-004.
--
-- NOT in scope: RLS policies, seed data, additional business tables.

-- =============================================================================
-- Table: public.deliverables
-- =============================================================================
create table public.deliverables (
  id                       uuid primary key default gen_random_uuid(),
  organization_id          uuid not null
                             references public.organizations(id) on delete restrict,
  action_id                uuid not null
                             references public.actions(id) on delete restrict,
  title                    text not null,
  description              text,
  responsible_user_id      uuid not null
                             references public.profiles(id) on delete restrict,
  status                   text not null default 'pending',
  due_date                 date,
  completed_at             timestamptz,
  sequence_number          integer not null default 1,
  created_by               uuid not null
                             references public.profiles(id) on delete restrict,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  deleted_at               timestamptz,

  constraint deliverables_status_check
    check (status in ('pending', 'in_progress', 'in_review', 'completed', 'cancelled')),

  constraint deliverables_completed_at_consistency_check
    check (
      (status = 'completed' and completed_at is not null)
      or
      (status <> 'completed' and completed_at is null)
    ),

  constraint deliverables_sequence_number_positive_check
    check (sequence_number > 0)
);

comment on table public.deliverables is
  'Deliverables (checkpoints, outputs, sub-tasks) tied to an action. Action progress is derived from deliverables and is not stored here as a manually editable field.';

comment on column public.deliverables.organization_id is
  'Owning organization (tenant scope). Restrict delete to protect referential integrity.';
comment on column public.deliverables.action_id is
  'Parent action. Restrict delete so deliverables must be reassigned before an action can be removed.';
comment on column public.deliverables.title is
  'Short name of the deliverable.';
comment on column public.deliverables.description is
  'Optional detailed description or acceptance criteria.';
comment on column public.deliverables.responsible_user_id is
  'Profile of the user accountable for completing the deliverable.';
comment on column public.deliverables.status is
  'Lifecycle state of the deliverable (pending, in_progress, in_review, completed, cancelled).';
comment on column public.deliverables.due_date is
  'Calendar date by which the deliverable should be completed.';
comment on column public.deliverables.completed_at is
  'Timestamp when status became completed. Must be NULL for every other status.';
comment on column public.deliverables.sequence_number is
  'Order of the deliverable within the parent action. Must be greater than zero.';
comment on column public.deliverables.created_by is
  'Profile of the user who created the deliverable.';
comment on column public.deliverables.deleted_at is
  'Soft-delete marker. NULL = active row.';

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index deliverables_organization_id_idx
  on public.deliverables (organization_id)
  where deleted_at is null;

create index deliverables_action_id_idx
  on public.deliverables (action_id)
  where deleted_at is null;

create index deliverables_responsible_user_id_idx
  on public.deliverables (responsible_user_id)
  where deleted_at is null;

create index deliverables_status_idx
  on public.deliverables (status)
  where deleted_at is null;

create index deliverables_due_date_idx
  on public.deliverables (due_date)
  where deleted_at is null;

-- Active deliverables scoped by action and status for list views.
create index deliverables_active_action_status_idx
  on public.deliverables (action_id, status)
  where deleted_at is null;

-- Unique sequence number per action for active deliverables.
create unique index deliverables_active_action_sequence_number_idx
  on public.deliverables (organization_id, action_id, sequence_number)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Trigger
-- ---------------------------------------------------------------------------
create trigger deliverables_set_updated_at
  before update on public.deliverables
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Grants and RLS
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.deliverables to authenticated;
grant all on public.deliverables to service_role;

alter table public.deliverables enable row level security;
