-- MVP domain entities use soft deletion (`deleted_at`). Remove inherited
-- physical DELETE privileges as an additional boundary beyond RLS. The
-- user_vessels association exception is restored by the following migration.
revoke delete on table
  public.organizations,
  public.profiles,
  public.clients,
  public.vessels,
  public.actions,
  public.deliverables,
  public.user_vessels,
  public.evidences,
  public.comments,
  public.attachments,
  public.notifications,
  public.audit_events
from authenticated;

-- Audit rows are written by trusted database functions. Authenticated clients
-- only need to read the rows that their RLS policy exposes.
revoke insert, update on table public.audit_events from authenticated;

comment on table public.audit_events is
  'Append-only audit trail; authenticated clients have SELECT only, scoped by RLS.';
