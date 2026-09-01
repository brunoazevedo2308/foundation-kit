-- DP Suite — US-006 (2º ciclo)
-- Espelha no repositório o hardening + a geração automática de notificações
-- JÁ APLICADOS no Supabase Development. Nenhum DDL novo é introduzido aqui.
--
-- Estado refletido:
--   1. policy `notifications_insert_same_org` removida e INSERT revogado de
--      `authenticated` (sem spoofing de recipient/actor/title); SELECT/UPDATE
--      permanecem, restritos por RLS ao próprio recipient/tenant.
--   2. funções privadas SECURITY DEFINER que geram as notificações de
--      `action.assigned`, `deliverable.assigned` e `comment.created`, com
--      `search_path = pg_catalog, public, private` e EXECUTE revogado de
--      public/anon/authenticated.
--
-- Idempotente. NÃO cria tabelas, scheduler, e-mail, push ou Realtime.

-- =============================================================================
-- 1. Hardening: sem INSERT direto pelo cliente
-- =============================================================================
drop policy if exists "notifications_insert_same_org" on public.notifications;

revoke insert on public.notifications from authenticated;
grant select, update on public.notifications to authenticated;
grant all on public.notifications to service_role;

create schema if not exists private;

-- =============================================================================
-- 2. action.assigned
-- =============================================================================
create or replace function private.notify_action_assignment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  _actor uuid := auth.uid();
begin
  if new.deleted_at is not null then
    return new;
  end if;

  if new.responsible_user_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.responsible_user_id is not distinct from old.responsible_user_id then
    return new;
  end if;

  if _actor is not distinct from new.responsible_user_id then
    return new;
  end if;

  insert into public.notifications (
    organization_id, recipient_user_id, actor_user_id,
    notification_type, title, body, entity_type, entity_id
  )
  values (
    new.organization_id,
    new.responsible_user_id,
    case when _actor is distinct from new.responsible_user_id then _actor else null end,
    'action.assigned',
    'Ação atribuída a você',
    left(new.title, 240),
    'action',
    new.id
  );

  return new;
end;
$$;

revoke all on function private.notify_action_assignment() from public, anon, authenticated;

drop trigger if exists trg_actions_notify_assignment on public.actions;
create trigger trg_actions_notify_assignment
  after insert or update of responsible_user_id on public.actions
  for each row execute function private.notify_action_assignment();

-- =============================================================================
-- 3. deliverable.assigned
-- =============================================================================
create or replace function private.notify_deliverable_assignment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  _actor uuid := auth.uid();
begin
  if new.deleted_at is not null then
    return new;
  end if;

  if new.responsible_user_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.responsible_user_id is not distinct from old.responsible_user_id then
    return new;
  end if;

  if _actor is not distinct from new.responsible_user_id then
    return new;
  end if;

  insert into public.notifications (
    organization_id, recipient_user_id, actor_user_id,
    notification_type, title, body, entity_type, entity_id
  )
  values (
    new.organization_id,
    new.responsible_user_id,
    case when _actor is distinct from new.responsible_user_id then _actor else null end,
    'deliverable.assigned',
    'Entregável atribuído a você',
    left(new.title, 240),
    'deliverable',
    new.id
  );

  return new;
end;
$$;

revoke all on function private.notify_deliverable_assignment() from public, anon, authenticated;

drop trigger if exists trg_deliverables_notify_assignment on public.deliverables;
create trigger trg_deliverables_notify_assignment
  after insert or update of responsible_user_id on public.deliverables
  for each row execute function private.notify_deliverable_assignment();

-- =============================================================================
-- 4. comment.created — notifica o responsável do deliverable/action comentado
-- =============================================================================
create or replace function private.notify_comment_created()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  _recipient   uuid;
  _entity_type text;
  _entity_id   uuid;
begin
  if new.deleted_at is not null then
    return new;
  end if;

  if new.deliverable_id is not null then
    select d.responsible_user_id, 'deliverable', d.id
      into _recipient, _entity_type, _entity_id
      from public.deliverables d
     where d.id = new.deliverable_id
       and d.deleted_at is null;
  elsif new.action_id is not null then
    select a.responsible_user_id, 'action', a.id
      into _recipient, _entity_type, _entity_id
      from public.actions a
     where a.id = new.action_id
       and a.deleted_at is null;
  end if;

  if _recipient is null or _entity_id is null then
    return new;
  end if;

  -- Nunca notifica o próprio autor do comentário.
  if _recipient is not distinct from new.author_user_id then
    return new;
  end if;

  insert into public.notifications (
    organization_id, recipient_user_id, actor_user_id,
    notification_type, title, body, entity_type, entity_id
  )
  values (
    new.organization_id,
    _recipient,
    new.author_user_id,
    'comment.created',
    'Novo comentário',
    left(new.body, 240),
    _entity_type,
    _entity_id
  );

  return new;
end;
$$;

revoke all on function private.notify_comment_created() from public, anon, authenticated;

drop trigger if exists trg_comments_notify_created on public.comments;
create trigger trg_comments_notify_created
  after insert on public.comments
  for each row execute function private.notify_comment_created();
