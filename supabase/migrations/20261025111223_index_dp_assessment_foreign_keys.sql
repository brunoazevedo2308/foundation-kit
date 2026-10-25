create index assessment_questions_created_by_idx
  on public.assessment_questions(created_by);

create index assessment_tracks_assigned_by_idx
  on public.assessment_candidate_tracks(assigned_by);

-- slot_id already has a UNIQUE index; remove the redundant plain index.
drop index if exists public.assessment_questions_slot_idx;
