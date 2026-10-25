-- Atino DP Suite — DP Assessment foundation (ATN-DP-ASS-004, items 5–7)
--
-- This delivery creates twelve protected exam blueprints (six Nautical and
-- six Engineering), each with the exact 50-slot theme/difficulty matrix from
-- the procedure. Question text is intentionally not seeded: the source
-- document explicitly states that it does not contain the exam questions.

create table public.assessment_models (
  id uuid primary key default gen_random_uuid(),
  department text not null,
  model_number smallint not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assessment_models_department_check
    check (department in ('nautical', 'engineering')),
  constraint assessment_models_number_check check (model_number between 1 and 6),
  constraint assessment_models_department_number_key unique (department, model_number)
);

comment on table public.assessment_models is
  'Protected DP Assessment blueprints. Model identity is visible only to administrators.';

create trigger assessment_models_set_updated_at
before update on public.assessment_models
for each row execute function public.set_updated_at();

create table public.assessment_model_slots (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references public.assessment_models(id) on delete cascade,
  sequence_number smallint not null,
  theme_code text not null,
  difficulty text not null,
  weight smallint generated always as (
    case difficulty when 'basic' then 1 when 'intermediate' then 2 else 3 end
  ) stored,
  created_at timestamptz not null default now(),
  constraint assessment_model_slots_sequence_check check (sequence_number between 1 and 50),
  constraint assessment_model_slots_theme_check check (
    theme_code in (
      'decision-support', 'fmea-key-elements', 'vessel-capability',
      'power-plant', 'software-sensors-prs', 'incident-factors'
    )
  ),
  constraint assessment_model_slots_difficulty_check
    check (difficulty in ('basic', 'intermediate', 'advanced')),
  constraint assessment_model_slots_model_sequence_key unique (model_id, sequence_number)
);

create table public.assessment_questions (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null unique
    references public.assessment_model_slots(id) on delete cascade,
  prompt text not null,
  options jsonb not null,
  correct_option smallint not null,
  criticality text not null default 'normal',
  explanation text,
  is_published boolean not null default false,
  created_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assessment_questions_prompt_check
    check (char_length(btrim(prompt)) between 10 and 4000 and prompt = btrim(prompt)),
  constraint assessment_questions_options_check
    check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) = 4),
  constraint assessment_questions_correct_option_check check (correct_option between 0 and 3),
  constraint assessment_questions_criticality_check
    check (criticality in ('normal', 'relevant', 'critical')),
  constraint assessment_questions_explanation_check
    check (explanation is null or char_length(explanation) <= 4000)
);

create trigger assessment_questions_set_updated_at
before update on public.assessment_questions
for each row execute function public.set_updated_at();

create table public.assessment_candidate_tracks (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  user_id uuid primary key references public.profiles(id) on delete cascade,
  department text not null,
  assigned_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assessment_candidate_tracks_department_check
    check (department in ('nautical', 'engineering'))
);

create trigger assessment_candidate_tracks_set_updated_at
before update on public.assessment_candidate_tracks
for each row execute function public.set_updated_at();

create table public.assessment_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  department text not null,
  model_id uuid not null references public.assessment_models(id) on delete restrict,
  attempt_number smallint not null default 1,
  status text not null default 'assigned',
  assigned_at timestamptz not null default now(),
  started_at timestamptz,
  submitted_at timestamptz,
  constraint assessment_assignments_department_check
    check (department in ('nautical', 'engineering')),
  constraint assessment_assignments_attempt_check check (attempt_number > 0),
  constraint assessment_assignments_status_check
    check (status in ('assigned', 'in_progress', 'submitted', 'cancelled')),
  constraint assessment_assignments_user_attempt_key unique (user_id, attempt_number)
);

create index assessment_model_slots_model_idx on public.assessment_model_slots(model_id);
create index assessment_questions_slot_idx on public.assessment_questions(slot_id);
create index assessment_tracks_organization_idx
  on public.assessment_candidate_tracks(organization_id);
create index assessment_assignments_organization_user_idx
  on public.assessment_assignments(organization_id, user_id);
create index assessment_assignments_model_idx on public.assessment_assignments(model_id);

-- Seed the twelve immutable model identities.
insert into public.assessment_models (department, model_number)
select department, model_number
from unnest(array['nautical'::text, 'engineering'::text]) as department
cross join generate_series(1, 6) as model_number;

-- Expand one matrix row into one protected question slot. The ordering is
-- stable inside every model; candidate presentation can be randomized later
-- without changing the validated distribution.
with matrix(department, theme_order, theme_code, basic_count, intermediate_count, advanced_count) as (
  values
    ('nautical', 1, 'decision-support',     1, 4, 3),
    ('nautical', 2, 'fmea-key-elements',    2, 3, 3),
    ('nautical', 3, 'vessel-capability',    1, 4, 3),
    ('nautical', 4, 'power-plant',          4, 4, 2),
    ('nautical', 5, 'software-sensors-prs', 2, 5, 4),
    ('nautical', 6, 'incident-factors',     1, 2, 2),
    ('engineering', 1, 'decision-support',     2, 3, 2),
    ('engineering', 2, 'fmea-key-elements',    2, 5, 5),
    ('engineering', 3, 'vessel-capability',    2, 2, 1),
    ('engineering', 4, 'power-plant',          2, 5, 6),
    ('engineering', 5, 'software-sensors-prs', 2, 3, 2),
    ('engineering', 6, 'incident-factors',     1, 3, 2)
), expanded as (
  select m.department, m.theme_order, m.theme_code, difficulty, difficulty_order, item_order
  from matrix m
  cross join lateral (
    select 'basic'::text as difficulty, 1 as difficulty_order, n as item_order
      from generate_series(1, m.basic_count) n
    union all
    select 'intermediate', 2, n from generate_series(1, m.intermediate_count) n
    union all
    select 'advanced', 3, n from generate_series(1, m.advanced_count) n
  ) difficulty_rows
), numbered as (
  select department, theme_code, difficulty,
    row_number() over (
      partition by department order by theme_order, difficulty_order, item_order
    )::smallint as sequence_number
  from expanded
)
insert into public.assessment_model_slots (model_id, sequence_number, theme_code, difficulty)
select model.id, numbered.sequence_number, numbered.theme_code, numbered.difficulty
from public.assessment_models model
join numbered on numbered.department = model.department;

-- Role helpers deliberately stay in the private schema and are unavailable
-- through the Data API.
create or replace function private.is_assessment_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select exists (
    select 1 from public.profiles profile
    where profile.id = auth.uid()
      and profile.deleted_at is null
      and profile.status = 'active'
      and profile.role in ('system_admin', 'organization_admin')
  );
$$;

revoke all on function private.is_assessment_admin() from public, anon, authenticated;
grant execute on function private.is_assessment_admin() to postgres, service_role;

create or replace function private.is_assessment_system_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select exists (
    select 1 from public.profiles profile
    where profile.id = auth.uid()
      and profile.deleted_at is null
      and profile.status = 'active'
      and profile.role = 'system_admin'
  );
$$;

revoke all on function private.is_assessment_system_admin() from public, anon, authenticated;
grant execute on function private.is_assessment_system_admin() to postgres, service_role;

create or replace function private.enforce_assessment_question_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if not private.is_assessment_system_admin() then
    raise exception 'system administrator required' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  elsif new.created_by <> old.created_by or new.slot_id <> old.slot_id then
    raise exception 'question author and matrix slot are immutable'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_assessment_question_integrity()
  from public, anon, authenticated;
grant execute on function private.enforce_assessment_question_integrity()
  to postgres, service_role;

create trigger assessment_questions_enforce_integrity
before insert or update on public.assessment_questions
for each row execute function private.enforce_assessment_question_integrity();

-- Enforce organization and author fields independent of client input.
create or replace function private.enforce_assessment_track_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  target_organization uuid;
begin
  if not private.is_assessment_admin() then
    raise exception 'assessment administrator required' using errcode = '42501';
  end if;

  select organization_id into target_organization
  from public.profiles
  where id = new.user_id and deleted_at is null and status = 'active';

  if target_organization is null or target_organization <> private.current_organization_id() then
    raise exception 'candidate must be active in the administrator organization'
      using errcode = '42501';
  end if;

  new.organization_id := target_organization;
  new.assigned_by := auth.uid();
  return new;
end;
$$;

revoke all on function private.enforce_assessment_track_integrity()
  from public, anon, authenticated;
grant execute on function private.enforce_assessment_track_integrity() to postgres, service_role;

create trigger assessment_candidate_tracks_enforce_integrity
before insert or update on public.assessment_candidate_tracks
for each row execute function private.enforce_assessment_track_integrity();

alter table public.assessment_models enable row level security;
alter table public.assessment_model_slots enable row level security;
alter table public.assessment_questions enable row level security;
alter table public.assessment_candidate_tracks enable row level security;
alter table public.assessment_assignments enable row level security;

create policy assessment_models_admin_select
on public.assessment_models for select to authenticated
using ((select private.is_assessment_admin()));

create policy assessment_models_system_admin_update
on public.assessment_models for update to authenticated
using ((select private.is_assessment_system_admin()))
with check ((select private.is_assessment_system_admin()));

create policy assessment_slots_admin_select
on public.assessment_model_slots for select to authenticated
using ((select private.is_assessment_admin()));

create policy assessment_questions_system_admin_all
on public.assessment_questions for all to authenticated
using ((select private.is_assessment_system_admin()))
with check ((select private.is_assessment_system_admin()));

create policy assessment_tracks_select
on public.assessment_candidate_tracks for select to authenticated
using (
  user_id = (select auth.uid())
  or (
    organization_id = (select private.current_organization_id())
    and (select private.is_assessment_admin())
  )
);

create policy assessment_tracks_admin_insert
on public.assessment_candidate_tracks for insert to authenticated
with check (
  organization_id = (select private.current_organization_id())
  and (select private.is_assessment_admin())
);

create policy assessment_tracks_admin_update
on public.assessment_candidate_tracks for update to authenticated
using (
  organization_id = (select private.current_organization_id())
  and (select private.is_assessment_admin())
)
with check (
  organization_id = (select private.current_organization_id())
  and (select private.is_assessment_admin())
);

create policy assessment_tracks_admin_delete
on public.assessment_candidate_tracks for delete to authenticated
using (
  organization_id = (select private.current_organization_id())
  and (select private.is_assessment_admin())
);

create policy assessment_assignments_admin_select
on public.assessment_assignments for select to authenticated
using (
  organization_id = (select private.current_organization_id())
  and (select private.is_assessment_admin())
);

-- Candidate-facing RPC. It persists one balanced random assignment but returns
-- no model id or number, so the identity is not exposed in browser data.
create or replace function public.assign_my_dp_assessment()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  caller_profile public.profiles;
  track public.assessment_candidate_tracks;
  existing_assignment public.assessment_assignments;
  selected_model_id uuid;
  next_attempt smallint;
  ready_model_count integer;
begin
  select * into caller_profile
  from public.profiles
  where id = auth.uid() and deleted_at is null and status = 'active';

  if caller_profile.id is null or caller_profile.organization_id is null then
    raise exception 'active profile required' using errcode = '42501';
  end if;

  select * into track
  from public.assessment_candidate_tracks
  where user_id = auth.uid();

  if track.user_id is null then
    return jsonb_build_object('state', 'unassigned');
  end if;

  select assignment.* into existing_assignment
  from public.assessment_assignments assignment
  where assignment.user_id = auth.uid()
    and assignment.status in ('assigned', 'in_progress')
  order by assignment.attempt_number desc
  limit 1;

  if existing_assignment.id is not null then
    return jsonb_build_object(
      'state', existing_assignment.status,
      'assignment_id', existing_assignment.id,
      'department', existing_assignment.department,
      'assigned_at', existing_assignment.assigned_at
    );
  end if;

  select count(*) into ready_model_count
  from public.assessment_models model
  where model.department = track.department
    and model.is_active
    and (
      select count(*) from public.assessment_model_slots slot
      join public.assessment_questions question on question.slot_id = slot.id
      where slot.model_id = model.id and question.is_published
    ) = 50;

  if ready_model_count <> 6 then
    return jsonb_build_object(
      'state', 'preparing',
      'department', track.department,
      'ready_models', ready_model_count,
      'required_models', 6
    );
  end if;

  select candidate.id into selected_model_id
  from public.assessment_models candidate
  left join public.assessment_assignments assignment
    on assignment.model_id = candidate.id
   and assignment.organization_id = caller_profile.organization_id
  where candidate.department = track.department and candidate.is_active
  group by candidate.id
  order by count(assignment.id), random()
  limit 1;

  select coalesce(max(attempt_number), 0) + 1 into next_attempt
  from public.assessment_assignments
  where user_id = auth.uid();

  insert into public.assessment_assignments (
    organization_id, user_id, department, model_id, attempt_number
  ) values (
    caller_profile.organization_id, auth.uid(), track.department,
    selected_model_id, next_attempt
  ) returning * into existing_assignment;

  insert into public.audit_events (
    organization_id, actor_user_id, entity_type, entity_id, event_type, event_data
  ) values (
    caller_profile.organization_id, auth.uid(), 'assessment_assignment',
    existing_assignment.id, 'assessment.model_assigned',
    jsonb_build_object('department', track.department, 'attempt_number', next_attempt)
  );

  return jsonb_build_object(
    'state', 'assigned',
    'assignment_id', existing_assignment.id,
    'department', track.department,
    'assigned_at', existing_assignment.assigned_at
  );
end;
$$;

revoke all on function public.assign_my_dp_assessment() from public, anon;
grant execute on function public.assign_my_dp_assessment() to authenticated;

-- Least-privilege Data API grants. Candidates never receive SELECT on
-- models, slots, questions, or assignments.
grant select on public.assessment_models to authenticated;
grant update (is_active) on public.assessment_models to authenticated;
grant select on public.assessment_model_slots to authenticated;
grant select, insert, update, delete on public.assessment_questions to authenticated;
grant select, insert, update, delete on public.assessment_candidate_tracks to authenticated;
grant select on public.assessment_assignments to authenticated;

grant all on public.assessment_models,
  public.assessment_model_slots,
  public.assessment_questions,
  public.assessment_candidate_tracks,
  public.assessment_assignments
to service_role;
