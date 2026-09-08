-- user_vessels is an association table without deleted_at. Unassignment is an
-- intentional physical DELETE guarded by user_vessels_delete_same_org_admin.
grant delete on table public.user_vessels to authenticated;

comment on table public.user_vessels is
  'Organization-scoped vessel assignments; admins may insert/delete links under RLS.';
