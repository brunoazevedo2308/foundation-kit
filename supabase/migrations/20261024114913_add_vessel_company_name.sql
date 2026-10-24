alter table public.vessels
  add column company_name text;

alter table public.vessels
  add constraint vessels_company_name_length_check
  check (company_name is null or char_length(company_name) <= 160);

comment on column public.vessels.company_name is
  'Optional company name associated directly with the vessel.';
