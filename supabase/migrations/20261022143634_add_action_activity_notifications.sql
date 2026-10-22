-- DP Suite — rastreabilidade colaborativa das ações.
--
-- Objetivos:
--   * manter um histórico legível dentro de cada ação;
--   * registrar autor, tipo e resumo de cada movimentação;
--   * notificar todos os demais participantes ativos da ação;
--   * permitir que o responsável pela ação/entregável envie evidências e
--     anexos sem ampliar os privilégios de edição administrativa.

create table public.action_activity (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  action_id uuid not null references public.actions(id) on delete restrict,
  actor_user_id uuid null references public.profiles(id) on delete set null
    default auth.uid(),
  event_type text not null check (
    event_type in (
      'action.created', 'action.updated', 'action.soft_deleted', 'manual_update',
      'deliverable.created', 'deliverable.updated', 'deliverable.soft_deleted',
      'evidence.created', 'evidence.updated', 'evidence.soft_deleted',
      'comment.created', 'comment.updated', 'comment.soft_deleted',
      'attachment.created', 'attachment.updated', 'attachment.soft_deleted'
    )
  ),
  summary text not null check (char_length(btrim(summary)) between 2 and 500),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

comment on table public.action_activity is
  'Immutable, tenant-scoped and user-visible activity history for an action.';
comment on column public.action_activity.metadata is
  'Minimal structured context only. Never store comment bodies, file contents or credentials.';

create index action_activity_action_created_idx
  on public.action_activity (action_id, created_at desc);
create index action_activity_org_created_idx
  on public.action_activity (organization_id, created_at desc);
create index action_activity_actor_idx
  on public.action_activity (actor_user_id, created_at desc)
  where actor_user_id is not null;

alter table public.action_activity enable row level security;

create policy action_activity_select_same_org
on public.action_activity for select to authenticated
using (
  organization_id = (select private.current_organization_id())
  and exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.organization_id = action_activity.organization_id
      and p.status = 'active'
      and p.deleted_at is null
  )
);

-- O cliente só cria notas manuais. Eventos automáticos são inseridos por
-- triggers privadas e não podem ser falsificados pela Data API.
create policy action_activity_insert_manual
on public.action_activity for insert to authenticated
with check (
  event_type = 'manual_update'
  and actor_user_id = (select auth.uid())
  and organization_id = (select private.current_organization_id())
  and exists (
    select 1
    from public.actions a
    join public.profiles p on p.id = (select auth.uid())
    where a.id = action_activity.action_id
      and a.organization_id = action_activity.organization_id
      and a.deleted_at is null
      and p.organization_id = a.organization_id
      and p.status = 'active'
      and p.deleted_at is null
  )
);

revoke all on table public.action_activity from public, anon, authenticated;
grant select on table public.action_activity to authenticated;
grant insert (action_id, event_type, summary) on table public.action_activity to authenticated;
grant all on table public.action_activity to service_role;

-- Completa tenant e ator antes da validação WITH CHECK.
create or replace function private.prepare_action_activity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  _organization_id uuid;
begin
  select a.organization_id
    into _organization_id
    from public.actions a
   where a.id = new.action_id;

  if _organization_id is null then
    raise exception 'action_activity: action not found' using errcode = '23503';
  end if;

  new.organization_id := _organization_id;
  new.actor_user_id := coalesce(new.actor_user_id, auth.uid());
  new.summary := btrim(new.summary);
  new.metadata := coalesce(new.metadata, '{}'::jsonb);
  return new;
end;
$$;

revoke all on function private.prepare_action_activity() from public, anon, authenticated;
grant execute on function private.prepare_action_activity() to postgres, service_role;

create trigger action_activity_prepare
before insert on public.action_activity
for each row execute function private.prepare_action_activity();

create or replace function private.prevent_action_activity_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'action_activity is immutable: % is not allowed', tg_op
    using errcode = '42501';
end;
$$;

revoke all on function private.prevent_action_activity_mutation()
  from public, anon, authenticated;
grant execute on function private.prevent_action_activity_mutation()
  to postgres, service_role;

create trigger action_activity_prevent_update
before update on public.action_activity
for each row execute function private.prevent_action_activity_mutation();

create trigger action_activity_prevent_delete
before delete on public.action_activity
for each row execute function private.prevent_action_activity_mutation();

-- Preserva o histórico básico das ações e dos eventos de auditoria já
-- existentes, sem disparar notificações retroativas durante o deploy.
insert into public.action_activity (
  organization_id, action_id, actor_user_id, event_type, summary, metadata, created_at
)
select
  a.organization_id,
  a.id,
  a.created_by,
  'action.created',
  'Ação criada',
  jsonb_build_object('source', 'backfill'),
  a.created_at
from public.actions a;

insert into public.action_activity (
  organization_id, action_id, actor_user_id, event_type, summary, metadata, created_at
)
select
  a.organization_id,
  a.id,
  ae.actor_user_id,
  case when ae.event_type = 'action.soft_deleted'
    then 'action.soft_deleted'
    else 'action.updated'
  end,
  case when ae.event_type = 'action.soft_deleted'
    then 'Ação removida'
    else 'Dados da ação atualizados'
  end,
  jsonb_build_object('source_audit_event_id', ae.id),
  ae.created_at
from public.audit_events ae
join public.actions a on a.id = ae.entity_id
where ae.entity_type = 'action'
  and ae.event_type in ('action.updated', 'action.soft_deleted');

-- Insere eventos automáticos por uma única trilha segura.
create or replace function private.add_action_activity(
  _action_id uuid,
  _event_type text,
  _summary text,
  _metadata jsonb default '{}'::jsonb,
  _actor_user_id uuid default auth.uid()
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  insert into public.action_activity (
    action_id, actor_user_id, event_type, summary, metadata
  ) values (
    _action_id, _actor_user_id, _event_type, left(_summary, 500), coalesce(_metadata, '{}'::jsonb)
  );
end;
$$;

revoke all on function private.add_action_activity(uuid, text, text, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function private.add_action_activity(uuid, text, text, jsonb, uuid)
  to postgres, service_role;

-- Cada nova movimentação avisa todos os demais participantes ativos: criador,
-- responsável atual, responsáveis de entregáveis e usuários que já
-- comentaram, enviaram arquivos ou alimentaram o histórico.
create or replace function private.notify_action_activity_participants()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  insert into public.notifications (
    organization_id, recipient_user_id, actor_user_id,
    notification_type, title, body, entity_type, entity_id
  )
  select
    new.organization_id,
    participant.user_id,
    new.actor_user_id,
    'action.updated',
    left(format('Ação "%s" teve uma nova atualização', a.title), 240),
    left(new.summary, 240),
    'action',
    new.action_id
  from public.actions a
  cross join lateral (
    select a.created_by as user_id
    union
    select a.responsible_user_id
    union
    select d.responsible_user_id
      from public.deliverables d
     where d.action_id = a.id and d.deleted_at is null
    union
    select aa.actor_user_id
      from public.action_activity aa
     where aa.action_id = a.id
    union
    select c.author_user_id
      from public.comments c
      left join public.deliverables d on d.id = c.deliverable_id
     where (c.action_id = a.id or d.action_id = a.id)
       and c.deleted_at is null
    union
    select e.uploaded_by
      from public.evidences e
      join public.deliverables d on d.id = e.deliverable_id
     where d.action_id = a.id and e.deleted_at is null
    union
    select at.uploaded_by
      from public.attachments at
      left join public.deliverables d on d.id = at.deliverable_id
      left join public.comments c on c.id = at.comment_id
      left join public.deliverables cd on cd.id = c.deliverable_id
     where (
       at.action_id = a.id
       or d.action_id = a.id
       or c.action_id = a.id
       or cd.action_id = a.id
     ) and at.deleted_at is null
  ) participant
  join public.profiles p on p.id = participant.user_id
  where a.id = new.action_id
    and participant.user_id is not null
    and participant.user_id is distinct from new.actor_user_id
    and p.organization_id = new.organization_id
    and p.status = 'active'
    and p.deleted_at is null;

  return new;
end;
$$;

revoke all on function private.notify_action_activity_participants()
  from public, anon, authenticated;
grant execute on function private.notify_action_activity_participants()
  to postgres, service_role;

create trigger action_activity_notify_participants
after insert on public.action_activity
for each row execute function private.notify_action_activity_participants();

-- Os triggers específicos antigos permanecem instalados para evitar locks
-- prolongados durante o deploy, mas suas funções passam a ser no-op. A trilha
-- central abaixo emite uma única notificação por participante.
create or replace function private.notify_action_assignment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  return new;
end;
$$;

create or replace function private.notify_deliverable_assignment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  return new;
end;
$$;

create or replace function private.notify_comment_created()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  return new;
end;
$$;

revoke all on function private.notify_action_assignment()
  from public, anon, authenticated;
revoke all on function private.notify_deliverable_assignment()
  from public, anon, authenticated;
revoke all on function private.notify_comment_created()
  from public, anon, authenticated;

create or replace function private.track_action_activity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  _event_type text;
  _summary text;
begin
  if tg_op = 'INSERT' then
    _event_type := 'action.created';
    _summary := 'Ação criada';
  elsif old.deleted_at is null and new.deleted_at is not null then
    _event_type := 'action.soft_deleted';
    _summary := 'Ação removida';
  elsif old.status is distinct from new.status then
    _event_type := 'action.updated';
    _summary := format('Status alterado de %s para %s', old.status, new.status);
  elsif old.responsible_user_id is distinct from new.responsible_user_id then
    _event_type := 'action.updated';
    _summary := 'Responsável pela ação alterado';
  else
    _event_type := 'action.updated';
    _summary := 'Dados da ação atualizados';
  end if;

  perform private.add_action_activity(
    new.id,
    _event_type,
    _summary,
    jsonb_strip_nulls(jsonb_build_object(
      'status', new.status,
      'situation', new.situation,
      'responsible_user_id', new.responsible_user_id,
      'due_date', new.due_date
    ))
  );
  return new;
end;
$$;

revoke all on function private.track_action_activity() from public, anon, authenticated;
grant execute on function private.track_action_activity() to postgres, service_role;

create trigger trg_actions_track_activity
after insert or update on public.actions
for each row execute function private.track_action_activity();

create or replace function private.track_deliverable_activity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  _event_type text;
  _summary text;
begin
  if tg_op = 'INSERT' then
    _event_type := 'deliverable.created';
    _summary := format('Entregável "%s" adicionado', new.title);
  elsif old.deleted_at is null and new.deleted_at is not null then
    _event_type := 'deliverable.soft_deleted';
    _summary := format('Entregável "%s" removido', new.title);
  else
    _event_type := 'deliverable.updated';
    _summary := format('Entregável "%s" atualizado', new.title);
  end if;

  perform private.add_action_activity(
    new.action_id,
    _event_type,
    _summary,
    jsonb_strip_nulls(jsonb_build_object(
      'deliverable_id', new.id,
      'status', new.status,
      'responsible_user_id', new.responsible_user_id,
      'due_date', new.due_date
    ))
  );
  return new;
end;
$$;

revoke all on function private.track_deliverable_activity() from public, anon, authenticated;
grant execute on function private.track_deliverable_activity() to postgres, service_role;

create trigger trg_deliverables_track_activity
after insert or update on public.deliverables
for each row execute function private.track_deliverable_activity();

create or replace function private.track_evidence_activity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  _action_id uuid;
  _event_type text;
  _summary text;
begin
  select d.action_id into _action_id
  from public.deliverables d where d.id = new.deliverable_id;

  if _action_id is null then return new; end if;

  if tg_op = 'INSERT' then
    _event_type := 'evidence.created';
    _summary := format('Evidência "%s" enviada', new.file_name);
  elsif old.deleted_at is null and new.deleted_at is not null then
    _event_type := 'evidence.soft_deleted';
    _summary := format('Evidência "%s" removida', new.file_name);
  else
    _event_type := 'evidence.updated';
    _summary := format('Evidência "%s" atualizada', new.file_name);
  end if;

  perform private.add_action_activity(
    _action_id, _event_type, _summary,
    jsonb_build_object('evidence_id', new.id, 'deliverable_id', new.deliverable_id)
  );
  return new;
end;
$$;

revoke all on function private.track_evidence_activity() from public, anon, authenticated;
grant execute on function private.track_evidence_activity() to postgres, service_role;

create trigger trg_evidences_track_activity
after insert or update on public.evidences
for each row execute function private.track_evidence_activity();

create or replace function private.track_comment_activity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  _action_id uuid;
  _event_type text;
  _summary text;
begin
  if new.action_id is not null then
    _action_id := new.action_id;
  else
    select d.action_id into _action_id
    from public.deliverables d where d.id = new.deliverable_id;
  end if;

  if _action_id is null then return new; end if;

  if tg_op = 'INSERT' then
    _event_type := 'comment.created';
    _summary := 'Novo comentário adicionado';
  elsif old.deleted_at is null and new.deleted_at is not null then
    _event_type := 'comment.soft_deleted';
    _summary := 'Comentário removido';
  else
    _event_type := 'comment.updated';
    _summary := 'Comentário atualizado';
  end if;

  perform private.add_action_activity(
    _action_id, _event_type, _summary,
    jsonb_strip_nulls(jsonb_build_object(
      'comment_id', new.id,
      'deliverable_id', new.deliverable_id
    ))
  );
  return new;
end;
$$;

revoke all on function private.track_comment_activity() from public, anon, authenticated;
grant execute on function private.track_comment_activity() to postgres, service_role;

create trigger trg_comments_track_activity
after insert or update on public.comments
for each row execute function private.track_comment_activity();

create or replace function private.track_attachment_activity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  _action_id uuid;
  _event_type text;
  _summary text;
begin
  if new.action_id is not null then
    _action_id := new.action_id;
  elsif new.deliverable_id is not null then
    select d.action_id into _action_id
    from public.deliverables d where d.id = new.deliverable_id;
  elsif new.comment_id is not null then
    select coalesce(c.action_id, d.action_id)
      into _action_id
      from public.comments c
      left join public.deliverables d on d.id = c.deliverable_id
     where c.id = new.comment_id;
  end if;

  if _action_id is null then return new; end if;

  if tg_op = 'INSERT' then
    _event_type := 'attachment.created';
    _summary := format('Anexo "%s" enviado', new.file_name);
  elsif old.deleted_at is null and new.deleted_at is not null then
    _event_type := 'attachment.soft_deleted';
    _summary := format('Anexo "%s" removido', new.file_name);
  else
    _event_type := 'attachment.updated';
    _summary := format('Anexo "%s" atualizado', new.file_name);
  end if;

  perform private.add_action_activity(
    _action_id, _event_type, _summary,
    jsonb_build_object('attachment_id', new.id)
  );
  return new;
end;
$$;

revoke all on function private.track_attachment_activity() from public, anon, authenticated;
grant execute on function private.track_attachment_activity() to postgres, service_role;

create trigger trg_attachments_track_activity
after insert or update on public.attachments
for each row execute function private.track_attachment_activity();

-- Colaboração com menor privilégio: responsáveis podem enviar novos arquivos,
-- mas continuam sem UPDATE/DELETE dos registros ou dos objetos armazenados.
drop policy if exists evidences_insert_authorized_deliverable on public.evidences;
create policy evidences_insert_authorized_deliverable
on public.evidences for insert to authenticated
with check (
  organization_id = (select private.current_organization_id())
  and uploaded_by = (select auth.uid())
  and exists (
    select 1
    from public.deliverables d
    join public.actions a on a.id = d.action_id
    where d.id = evidences.deliverable_id
      and d.organization_id = evidences.organization_id
      and d.deleted_at is null
      and a.organization_id = evidences.organization_id
      and a.deleted_at is null
      and (
        (select private.can_manage_operational_data())
        or d.responsible_user_id = (select auth.uid())
        or a.responsible_user_id = (select auth.uid())
      )
  )
);

drop policy if exists attachments_insert_same_org on public.attachments;
create policy attachments_insert_same_org
on public.attachments for insert to authenticated
with check (
  organization_id = (select private.current_organization_id())
  and uploaded_by = (select auth.uid())
  and (
    (select private.can_manage_operational_data())
    or exists (
      select 1
      from public.actions a
      where a.id = attachments.action_id
        and a.organization_id = attachments.organization_id
        and a.deleted_at is null
        and a.responsible_user_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.deliverables d
      join public.actions a on a.id = d.action_id
      where d.id = attachments.deliverable_id
        and d.organization_id = attachments.organization_id
        and d.deleted_at is null
        and a.organization_id = attachments.organization_id
        and a.deleted_at is null
        and (
          d.responsible_user_id = (select auth.uid())
          or a.responsible_user_id = (select auth.uid())
        )
    )
  )
);
