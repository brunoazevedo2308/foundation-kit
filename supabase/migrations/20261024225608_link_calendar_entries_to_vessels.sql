alter table public.calendar_entries
  add column vessel_id uuid not null
    references public.vessels(id) on delete restrict;

comment on column public.calendar_entries.vessel_id is
  'Vessel associated with this calendar note or scheduled activity.';

create index calendar_entries_vessel_starts_at_idx
  on public.calendar_entries (vessel_id, starts_at);

create or replace function private.enforce_calendar_entry_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  vessel_organization_id uuid;
begin
  if new.organization_id <> (select private.current_organization_id()) then
    raise exception 'calendar_entry.organization_id must match the authenticated organization';
  end if;

  if new.created_by <> auth.uid() then
    raise exception 'calendar_entry.created_by must match the authenticated user';
  end if;

  select organization_id
    into vessel_organization_id
    from public.vessels
   where id = new.vessel_id
     and deleted_at is null;

  if vessel_organization_id is null then
    raise exception 'calendar_entry.vessel_id must reference an active vessel';
  end if;

  if vessel_organization_id <> new.organization_id then
    raise exception 'calendar_entry.vessel_id must belong to the same organization';
  end if;

  if new.entry_type = 'note' then
    new.all_day := true;
    new.ends_at := null;
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_calendar_entry_integrity()
  from public, anon, authenticated;
grant execute on function private.enforce_calendar_entry_integrity()
  to postgres, service_role;

grant insert (vessel_id) on public.calendar_entries to authenticated;

create or replace function private.audit_calendar_entry_create()
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
    new.organization_id,
    auth.uid(),
    'calendar_entry',
    new.id,
    case new.entry_type
      when 'note' then 'calendar.note_created'
      else 'calendar.activity_created'
    end,
    jsonb_build_object(
      'entry_type', new.entry_type,
      'starts_at', new.starts_at,
      'all_day', new.all_day,
      'vessel_id', new.vessel_id
    )
  );

  return new;
end;
$$;

revoke all on function private.audit_calendar_entry_create()
  from public, anon, authenticated;
grant execute on function private.audit_calendar_entry_create()
  to postgres, service_role;
