-- Status operacional automático por prazo e alertas de calendário.
--
-- O status de workflow de public.actions continua intacto. A interface deriva
-- as cores a partir de status + due_date, enquanto este job cria notificações
-- idempotentes quando uma ação entra na janela de 7 dias ou fica atrasada.

create extension if not exists pg_cron with schema pg_catalog;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

create table private.action_deadline_alerts (
  action_id uuid not null references public.actions(id) on delete cascade,
  due_date date not null,
  alert_type text not null check (alert_type in ('due_soon', 'overdue')),
  processed_for_date date not null,
  created_at timestamptz not null default now(),
  primary key (action_id, due_date, alert_type)
);

comment on table private.action_deadline_alerts is
  'Idempotency ledger for calendar-driven action deadline notifications.';

revoke all on table private.action_deadline_alerts from public, anon, authenticated;
grant all on table private.action_deadline_alerts to postgres, service_role;

create or replace function private.process_action_deadline_alerts(
  _reference_instant timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  _action record;
  _inserted boolean;
  _processed integer := 0;
begin
  for _action in
    select
      a.id,
      a.organization_id,
      a.title,
      a.due_date,
      (coalesce(_reference_instant, now()) at time zone o.timezone)::date as local_today,
      case
        when (coalesce(_reference_instant, now()) at time zone o.timezone)::date > a.due_date
          then 'overdue'
        else 'due_soon'
      end as alert_type
    from public.actions a
    join public.organizations o on o.id = a.organization_id
    where a.deleted_at is null
      and a.status not in ('completed', 'cancelled')
      and a.due_date is not null
      and (
        (coalesce(_reference_instant, now()) at time zone o.timezone)::date > a.due_date
        or (coalesce(_reference_instant, now()) at time zone o.timezone)::date
          between a.due_date - 7 and a.due_date
      )
  loop
    _inserted := false;

    insert into private.action_deadline_alerts (
      action_id, due_date, alert_type, processed_for_date
    ) values (
      _action.id, _action.due_date, _action.alert_type, _action.local_today
    )
    on conflict (action_id, due_date, alert_type) do nothing
    returning true into _inserted;

    if coalesce(_inserted, false) then
      insert into public.notifications (
        organization_id,
        recipient_user_id,
        actor_user_id,
        notification_type,
        title,
        body,
        entity_type,
        entity_id
      )
      select
        _action.organization_id,
        participant.user_id,
        null,
        case _action.alert_type
          when 'overdue' then 'action.overdue'
          else 'action.due_soon'
        end,
        left(
          case _action.alert_type
            when 'overdue' then format('Ação "%s" está atrasada', _action.title)
            else format('Ação "%s" está próxima do vencimento', _action.title)
          end,
          240
        ),
        left(
          case _action.alert_type
            when 'overdue' then format(
              'O prazo venceu em %s. A ação requer atenção imediata.',
              to_char(_action.due_date, 'DD/MM/YYYY')
            )
            else format(
              'Faltam até 7 dias para o prazo de %s.',
              to_char(_action.due_date, 'DD/MM/YYYY')
            )
          end,
          240
        ),
        'action',
        _action.id
      from (
        select a.created_by as user_id
        from public.actions a where a.id = _action.id
        union
        select a.responsible_user_id
        from public.actions a where a.id = _action.id
        union
        select ap.user_id
        from public.action_participants ap where ap.action_id = _action.id
        union
        select d.responsible_user_id
        from public.deliverables d
        where d.action_id = _action.id and d.deleted_at is null
        union
        select aa.actor_user_id
        from public.action_activity aa where aa.action_id = _action.id
        union
        select c.author_user_id
        from public.comments c
        left join public.deliverables d on d.id = c.deliverable_id
        where (c.action_id = _action.id or d.action_id = _action.id)
          and c.deleted_at is null
        union
        select e.uploaded_by
        from public.evidences e
        join public.deliverables d on d.id = e.deliverable_id
        where d.action_id = _action.id and e.deleted_at is null
        union
        select at.uploaded_by
        from public.attachments at
        left join public.deliverables d on d.id = at.deliverable_id
        left join public.comments c on c.id = at.comment_id
        left join public.deliverables cd on cd.id = c.deliverable_id
        where (
          at.action_id = _action.id
          or d.action_id = _action.id
          or c.action_id = _action.id
          or cd.action_id = _action.id
        )
          and at.deleted_at is null
      ) participant
      join public.profiles p on p.id = participant.user_id
      where participant.user_id is not null
        and p.organization_id = _action.organization_id
        and p.status = 'active'
        and p.deleted_at is null;

      _processed := _processed + 1;
    end if;
  end loop;

  return _processed;
end;
$$;

comment on function private.process_action_deadline_alerts(timestamptz) is
  'Creates one due-soon and one overdue notification set per action/due-date, using each organization timezone.';

revoke all on function private.process_action_deadline_alerts(timestamptz)
  from public, anon, authenticated;
grant execute on function private.process_action_deadline_alerts(timestamptz)
  to postgres, service_role;

-- Executa a cada hora para respeitar a virada de data de cada organização.
-- O ledger acima torna a execução idempotente.
select cron.schedule(
  'dp-suite-action-deadline-alerts',
  '5 * * * *',
  $cron$select private.process_action_deadline_alerts();$cron$
);

-- Processa imediatamente ações já dentro de uma faixa na data do deploy.
select private.process_action_deadline_alerts();
