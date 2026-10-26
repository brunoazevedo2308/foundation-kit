alter table public.calendar_entries
  drop constraint calendar_entries_type_check;

alter table public.calendar_entries
  add constraint calendar_entries_type_check
  check (
    entry_type in (
      'note',
      'activity',
      'annual_trials',
      'proving_trials',
      'dp_audit'
    )
  );

comment on column public.calendar_entries.entry_type is
  'Scheduled activity type. New records use annual_trials, proving_trials or dp_audit; note and activity are retained for historical compatibility.';
