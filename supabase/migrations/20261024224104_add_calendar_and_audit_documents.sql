alter table public.document_files
  drop constraint document_files_category_check;

alter table public.document_files
  add constraint document_files_category_check
  check (category in ('procedures', 'forms', 'trials-fmea', 'documents', 'audits'));

create table public.calendar_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  entry_type text not null,
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default false,
  created_by uuid not null
    references public.profiles(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_entries_type_check
    check (entry_type in ('note', 'activity')),
  constraint calendar_entries_title_check
    check (char_length(btrim(title)) between 2 and 160 and title = btrim(title)),
  constraint calendar_entries_description_check
    check (description is null or char_length(description) <= 4000),
  constraint calendar_entries_range_check
    check (ends_at is null or ends_at >= starts_at)
);

comment on table public.calendar_entries is
  'Organization calendar notes and scheduled activities.';
comment on column public.calendar_entries.entry_type is
  'Entry kind: note or activity.';

create index calendar_entries_organization_starts_at_idx
  on public.calendar_entries (organization_id, starts_at);
create index calendar_entries_created_by_idx
  on public.calendar_entries (created_by);

create trigger calendar_entries_set_updated_at
before update on public.calendar_entries
for each row execute function public.set_updated_at();

create or replace function private.enforce_calendar_entry_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if new.organization_id <> (select private.current_organization_id()) then
    raise exception 'calendar_entry.organization_id must match the authenticated organization';
  end if;

  if new.created_by <> auth.uid() then
    raise exception 'calendar_entry.created_by must match the authenticated user';
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

create trigger calendar_entries_enforce_integrity
before insert on public.calendar_entries
for each row execute function private.enforce_calendar_entry_integrity();

alter table public.calendar_entries enable row level security;

create policy calendar_entries_select_same_org
on public.calendar_entries
for select
to authenticated
using (
  organization_id = (select private.current_organization_id())
);

create policy calendar_entries_insert_same_org
on public.calendar_entries
for insert
to authenticated
with check (
  organization_id = (select private.current_organization_id())
  and created_by = (select auth.uid())
);

grant select on public.calendar_entries to authenticated;
grant insert (
  organization_id,
  entry_type,
  title,
  description,
  starts_at,
  ends_at,
  all_day,
  created_by
) on public.calendar_entries to authenticated;
grant all on public.calendar_entries to service_role;

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
      'all_day', new.all_day
    )
  );

  return new;
end;
$$;

revoke all on function private.audit_calendar_entry_create()
  from public, anon, authenticated;
grant execute on function private.audit_calendar_entry_create()
  to postgres, service_role;

create trigger calendar_entries_audit_create
after insert on public.calendar_entries
for each row execute function private.audit_calendar_entry_create();
