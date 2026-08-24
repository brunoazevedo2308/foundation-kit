-- DP Suite — US-006 (2º ciclo)
-- Sincroniza no repositório o hardening + a geração automática de
-- notificações JÁ APLICADOS no Supabase Development.
--
-- Objetivo:
--   1. Remover a possibilidade de INSERT direto em public.notifications por
--      usuários autenticados (spoofing de recipient/actor/title).
--   2. Criar as funções privadas SECURITY DEFINER que geram notificações de
--      `action.assigned`, `deliverable.assigned` e `comment.created`, com
--      EXECUTE revogado de public/anon/authenticated.
--
-- Idempotente: pode ser reaplicada sem duplicar objetos existentes.
-- NÃO cria tabelas, scheduler, e-mail, push ou Realtime.

-- =============================================================================
-- 1. Hardening: sem INSERT direto pelo cliente
-- =============================================================================
drop policy if exists "notifications_insert_same_org" on public.notifications;

revoke insert on public.notifications from authenticated;
-- SELECT/UPDATE permanecem (RLS restringe ao próprio recipient/tenant).
grant select, update on public.notifications to authenticated;
grant all on public.notifications to service_role;

-- =============================================================================
-- 2. Emissor central (SECURITY DEFINER, schema private)
-- =============================================================================
create schema if not exists private;

create or replace function private.emit_notification(
  _organization_id   uuid,
  _recipient_user_id uuid,
  _actor_user_id     uuid,
  _notification_type text,
  _title             text,
  _body              text,
  _entity_type       text,
  _entity_id         uuid
) returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  -- Nunca notifica o próprio autor da mudança.
  if _recipient_user_id is null
     or (_actor_user_id is not null and _recipient_user_id = _actor_user_id) then
    return;
  end if;

  insert into public.notifications (
    organization_id, recipient_user_id, actor_user_id,
    notification_type, title, body, entity_type, entity_id
  )
  values (
    _organization_id, _recipient_user_id, _actor_user_id,
    _notification_type, _title, _body, _entity_type, _entity_id
  );
end;
$$;

revoke all on function private.emit_notification(
  uuid, uuid, uuid, text, text, text, text, uuid
) from public, anon, authenticated;

-- =============================================================================
-- 3. action.assigned
-- =============================================================================
create or replace function private.notify_action_assigned()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'UPDATE'
     and new.responsible_user_id is not distinct from old.responsible_user_id then
    return new;
  end if;

  perform private.emit_notification(
    new.organization_id,
    new.responsible_user_id,
    auth.uid(),
    'action.assigned',
    'Você foi designado para uma ação',
    new.title,
    'action',
    new.id
  );
  return new;
end;
$$;

revoke all on function private.notify_action_assigned() from public, anon, authenticated;

drop trigger if exists trg_actions_notify_assigned on public.actions;
create trigger trg_actions_notify_assigned
  after insert or update of responsible_user_id on public.actions
  for each row execute function private.notify_action_assigned();

-- =============================================================================
-- 4. deliverable.assigned
-- =============================================================================
create or replace function private.notify_deliverable_assigned()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'UPDATE'
     and new.responsible_user_id is not distinct from old.responsible_user_id then
    return new;
  end if;

  perform private.emit_notification(
    new.organization_id,
    new.responsible_user_id,
    auth.uid(),
    'deliverable.assigned',
    'Você foi designado para um entregável',
    new.title,
    'deliverable',
    new.id
  );
  return new;
end;
$$;

revoke all on function private.notify_deliverable_assigned() from public, anon, authenticated;

drop trigger if exists trg_deliverables_notify_assigned on public.deliverables;
create trigger trg_deliverables_notify_assigned
  after insert or update of responsible_user_id on public.deliverables
  for each row execute function private.notify_deliverable_assigned();

-- =============================================================================
-- 5. comment.created — notifica o responsável pela ação/entregável comentado
-- =============================================================================
create or replace function private.notify_comment_created()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  _recipient uuid;
  _action_id uuid;
begin
  if new.action_id is not null then
    select a.responsible_user_id, a.id
      into _recipient, _action_id
      from public.actions a
     where a.id = new.action_id;
  else
    select d.responsible_user_id, d.action_id
      into _recipient, _action_id
      from public.deliverables d
     where d.id = new.deliverable_id;
  end if;

  perform private.emit_notification(
    new.organization_id,
    _recipient,
    new.author_user_id,
    'comment.created',
    'Novo comentário',
    left(new.body, 200),
    'action',
    _action_id
  );
  return new;
end;
$$;

revoke all on function private.notify_comment_created() from public, anon, authenticated;

drop trigger if exists trg_comments_notify_created on public.comments;
create trigger trg_comments_notify_created
  after insert on public.comments
  for each row execute function private.notify_comment_created();
