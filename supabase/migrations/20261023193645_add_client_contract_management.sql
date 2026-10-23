alter table public.clients
  add column contract_management text,
  add column contract_manager text;

alter table public.clients
  add constraint clients_contract_management_length_check
    check (contract_management is null or char_length(contract_management) <= 160),
  add constraint clients_contract_manager_length_check
    check (contract_manager is null or char_length(contract_manager) <= 120);

comment on column public.clients.contract_management is
  'Optional contract management area or department responsible for the client relationship.';

comment on column public.clients.contract_manager is
  'Optional name of the contract manager responsible for the client relationship.';
