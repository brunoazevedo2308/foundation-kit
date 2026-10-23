alter table public.vessels
  add column contract_management text,
  add column contract_manager text;

alter table public.vessels
  add constraint vessels_contract_management_length_check
    check (contract_management is null or char_length(contract_management) <= 160),
  add constraint vessels_contract_manager_length_check
    check (contract_manager is null or char_length(contract_manager) <= 120);

comment on column public.vessels.contract_management is
  'Optional contract management area or department responsible for the vessel.';

comment on column public.vessels.contract_manager is
  'Optional name of the contract manager responsible for the vessel.';
