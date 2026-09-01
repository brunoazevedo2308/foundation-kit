create or replace function private.audit_action_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if tg_op = 'UPDATE' then
    if old.deleted_at is null and new.deleted_at is not null then
      insert into public.audit_events (
        organization_id,
        actor_user_id,
        entity_type,
        entity_id,
        event_type,
        event_data
      ) values (
        new.organization_id,
        auth.uid(),
        'action',
        new.id,
        'action.soft_deleted',
        jsonb_build_object(
          'before', to_jsonb(old),
          'after', to_jsonb(new)
        )
      );
    else
      insert into public.audit_events (
        organization_id,
        actor_user_id,
        entity_type,
        entity_id,
        event_type,
        event_data
      ) values (
        new.organization_id,
        auth.uid(),
        'action',
        new.id,
        'action.updated',
        jsonb_build_object(
          'before', to_jsonb(old),
          'after', to_jsonb(new)
        )
      );
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.audit_action_change() from public, anon, authenticated;
grant execute on function private.audit_action_change() to postgres, service_role;

drop trigger if exists trg_actions_audit_change on public.actions;
create trigger trg_actions_audit_change
after update on public.actions
for each row execute function private.audit_action_change();
