-- US-004 — align comment soft-delete with product ownership rules.
--
-- An UPDATE that sets deleted_at must still be able to see the resulting row
-- for PostgREST's `update(...).select(...)` response. The previous SELECT
-- policy hid every deleted row, causing PostgreSQL to reject the update. Keep
-- deleted comments hidden from ordinary organization reads, while allowing
-- the author and organization administrators to see the retained row.
--
-- The previous UPDATE policy also allowed any member of an organization to
-- update any active comment. Restrict writes to the author or an administrator.

drop policy if exists "comments_select_same_org" on public.comments;
create policy "comments_select_same_org"
on public.comments
for select
to authenticated
using (
  organization_id = (select private.current_organization_id())
  and (
    deleted_at is null
    or author_user_id = (select auth.uid())
    or (select private.is_org_admin())
  )
);

drop policy if exists "comments_update_same_org" on public.comments;
create policy "comments_update_same_org"
on public.comments
for update
to authenticated
using (
  organization_id = (select private.current_organization_id())
  and deleted_at is null
  and (
    author_user_id = (select auth.uid())
    or (select private.is_org_admin())
  )
)
with check (
  organization_id = (select private.current_organization_id())
  and (
    author_user_id = (select auth.uid())
    or (select private.is_org_admin())
  )
);
