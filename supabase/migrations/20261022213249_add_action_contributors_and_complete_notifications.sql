-- Atino DP Suite — participantes explícitos e notificações completas.

create table public.action_participants (
  action_id uuid not null references public.actions(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  added_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (action_id, user_id)
);

comment on table public.action_participants is
  'Usuários explicitamente designados para contribuir em uma ação.';

create index action_participants_user_idx
  on public.action_participants (user_id, created_at desc);
create index action_participants_org_idx
  on public.action_participants (organization_id, action_id);

alter table public.action_participants enable row level security;

create policy action_participants_select_same_org
on public.action_participants for select to authenticated
using (
  organization_id = (select private.current_organization_id())
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.organization_id = action_participants.organization_id
      and p.status = 'active'
      and p.deleted_at is null
  )
);

create policy action_participants_insert_admin
on public.action_participants for insert to authenticated
with check (
  organization_id = (select private.current_organization_id())
  and added_by = (select auth.uid())
  and (select private.can_manage_operational_data())
);

create policy action_participants_delete_admin
on public.action_participants for delete to authenticated
using (
  organization_id = (select private.current_organization_id())
  and (select private.can_manage_operational_data())
);

revoke all on table public.action_participants from public, anon, authenticated;
grant select on table public.action_participants to authenticated;
grant insert (action_id, user_id) on table public.action_participants to authenticated;
grant delete on table public.action_participants to authenticated;
grant all on table public.action_participants to service_role;

create or replace function private.prepare_action_participant()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  _action_org uuid;
  _participant_org uuid;
begin
  select a.organization_id into _action_org
  from public.actions a
  where a.id = new.action_id and a.deleted_at is null;

  select p.organization_id into _participant_org
  from public.profiles p
  where p.id = new.user_id and p.status = 'active' and p.deleted_at is null;

  if _action_org is null or _participant_org is null or _action_org <> _participant_org then
    raise exception 'action_participants: action and participant must be active and in the same organization'
      using errcode = '23514';
  end if;

  new.organization_id := _action_org;
  new.added_by := auth.uid();
  return new;
end;
$$;

revoke all on function private.prepare_action_participant() from public, anon, authenticated;
grant execute on function private.prepare_action_participant() to postgres, service_role;

create trigger action_participants_prepare
before insert on public.action_participants
for each row execute function private.prepare_action_participant();

create or replace function private.prevent_action_participant_update()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'action_participants cannot be updated' using errcode = '42501';
end;
$$;

revoke all on function private.prevent_action_participant_update() from public, anon, authenticated;
grant execute on function private.prevent_action_participant_update() to postgres, service_role;

create trigger action_participants_prevent_update
before update on public.action_participants
for each row execute function private.prevent_action_participant_update();

create or replace function private.track_action_participant_activity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  _profile_name text;
  _row public.action_participants;
begin
  _row := case when tg_op = 'DELETE' then old else new end;
  select coalesce(p.full_name, p.id::text) into _profile_name
  from public.profiles p where p.id = _row.user_id;

  perform private.add_action_activity(
    _row.action_id,
    'action.updated',
    format(
      'Participante "%s" %s',
      _profile_name,
      case when tg_op = 'DELETE' then 'removido' else 'adicionado' end
    ),
    jsonb_build_object('participant_user_id', _row.user_id, 'operation', lower(tg_op)),
    auth.uid()
  );
  return _row;
end;
$$;

revoke all on function private.track_action_participant_activity() from public, anon, authenticated;
grant execute on function private.track_action_participant_activity() to postgres, service_role;

create trigger action_participants_track_activity
after insert or delete on public.action_participants
for each row execute function private.track_action_participant_activity();

-- Inclui participantes designados e também o autor da alteração. Assim toda
-- movimentação aparece na central de cada envolvido, inclusive de quem a fez.
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
    union select a.responsible_user_id
    union select new.actor_user_id
    union select ap.user_id from public.action_participants ap where ap.action_id = a.id
    union select d.responsible_user_id from public.deliverables d
      where d.action_id = a.id and d.deleted_at is null
    union select aa.actor_user_id from public.action_activity aa where aa.action_id = a.id
    union select c.author_user_id
      from public.comments c
      left join public.deliverables d on d.id = c.deliverable_id
      where (c.action_id = a.id or d.action_id = a.id) and c.deleted_at is null
    union select e.uploaded_by
      from public.evidences e join public.deliverables d on d.id = e.deliverable_id
      where d.action_id = a.id and e.deleted_at is null
    union select at.uploaded_by
      from public.attachments at
      left join public.deliverables d on d.id = at.deliverable_id
      left join public.comments c on c.id = at.comment_id
      left join public.deliverables cd on cd.id = c.deliverable_id
      where (at.action_id = a.id or d.action_id = a.id or c.action_id = a.id or cd.action_id = a.id)
        and at.deleted_at is null
  ) participant
  join public.profiles p on p.id = participant.user_id
  where a.id = new.action_id
    and participant.user_id is not null
    and p.organization_id = new.organization_id
    and p.status = 'active'
    and p.deleted_at is null;
  return new;
end;
$$;

-- Participantes explícitos podem colaborar com arquivos/evidências sem ganhar
-- permissão de editar ou apagar a ação.
drop policy if exists evidences_insert_authorized_deliverable on public.evidences;
create policy evidences_insert_authorized_deliverable
on public.evidences for insert to authenticated
with check (
  organization_id = (select private.current_organization_id())
  and uploaded_by = (select auth.uid())
  and exists (
    select 1 from public.deliverables d
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
        or exists (
          select 1 from public.action_participants ap
          where ap.action_id = a.id and ap.user_id = (select auth.uid())
        )
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
      select 1 from public.actions a
      where a.id = attachments.action_id
        and a.organization_id = attachments.organization_id
        and a.deleted_at is null
        and (
          a.responsible_user_id = (select auth.uid())
          or exists (
            select 1 from public.action_participants ap
            where ap.action_id = a.id and ap.user_id = (select auth.uid())
          )
        )
    )
    or exists (
      select 1 from public.deliverables d
      join public.actions a on a.id = d.action_id
      where d.id = attachments.deliverable_id
        and d.organization_id = attachments.organization_id
        and d.deleted_at is null
        and a.organization_id = attachments.organization_id
        and a.deleted_at is null
        and (
          d.responsible_user_id = (select auth.uid())
          or a.responsible_user_id = (select auth.uid())
          or exists (
            select 1 from public.action_participants ap
            where ap.action_id = a.id and ap.user_id = (select auth.uid())
          )
        )
    )
  )
);
