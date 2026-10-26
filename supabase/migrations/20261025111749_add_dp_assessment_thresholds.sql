alter table public.assessment_models
  add column duration_minutes smallint not null default 90,
  add constraint assessment_models_duration_check
    check (duration_minutes between 30 and 240);

create table public.assessment_theme_rules (
  department text not null,
  theme_code text not null,
  minimum_percentage smallint not null,
  created_at timestamptz not null default now(),
  primary key (department, theme_code),
  constraint assessment_theme_rules_department_check
    check (department in ('nautical', 'engineering')),
  constraint assessment_theme_rules_theme_check check (
    theme_code in (
      'decision-support', 'fmea-key-elements', 'vessel-capability',
      'power-plant', 'software-sensors-prs', 'incident-factors'
    )
  ),
  constraint assessment_theme_rules_minimum_check
    check (minimum_percentage between 0 and 100)
);

insert into public.assessment_theme_rules (
  department, theme_code, minimum_percentage
) values
  ('nautical', 'decision-support', 80),
  ('nautical', 'fmea-key-elements', 80),
  ('nautical', 'vessel-capability', 85),
  ('nautical', 'power-plant', 75),
  ('nautical', 'software-sensors-prs', 85),
  ('nautical', 'incident-factors', 85),
  ('engineering', 'decision-support', 80),
  ('engineering', 'fmea-key-elements', 85),
  ('engineering', 'vessel-capability', 75),
  ('engineering', 'power-plant', 85),
  ('engineering', 'software-sensors-prs', 80),
  ('engineering', 'incident-factors', 85);

alter table public.assessment_theme_rules enable row level security;

create policy assessment_theme_rules_admin_select
on public.assessment_theme_rules for select to authenticated
using ((select private.is_assessment_admin()));

grant select on public.assessment_theme_rules to authenticated;
grant all on public.assessment_theme_rules to service_role;

comment on table public.assessment_theme_rules is
  'Minimum weighted competence percentage by department and theme from ATN-DP-ASS-004 item 7.';
