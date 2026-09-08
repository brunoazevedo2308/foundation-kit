-- The MVP uses soft deletion (`deleted_at`) exclusively. Physical DELETE is
-- not part of the authenticated client contract, so remove the inherited
-- table privilege as an additional boundary beyond RLS.
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
