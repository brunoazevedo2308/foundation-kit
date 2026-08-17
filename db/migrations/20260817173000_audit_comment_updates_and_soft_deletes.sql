-- US-004 — auditoria de UPDATE e soft-delete de Comentários.
-- Espelha a migration `audit_comment_updates_and_soft_deletes` já aplicada
-- externamente no Development (dp-suite-dev). Idempotente.

create or replace function private.audit_comment_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  insert into public.audit_events (
    organization_id,
    actor_user_id,
    entity_type,
    entity_id,
    event_type,
    event_data
  ) values (
    old.organization_id,
    auth.uid(),
    'comment',
    old.id,
    case when old.deleted_at is null and new.deleted_at is not null then 'comment.soft_deleted' else 'comment.updated' end,
    jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new))
  );
  return new;
end;
$$;

revoke all on function private.audit_comment_change() from public, anon, authenticated;
grant execute on function private.audit_comment_change() to postgres, service_role;

drop trigger if exists trg_comments_audit_change on public.comments;
create trigger trg_comments_audit_change
after update on public.comments
for each row execute function private.audit_comment_change();
