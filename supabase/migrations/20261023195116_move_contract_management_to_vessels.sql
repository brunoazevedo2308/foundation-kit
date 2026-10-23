alter table public.vessels
  add column if not exists contract_management text,
  add column if not exists contract_manager text;

-- Preserve any values entered during the short staging-only interval in which
-- these attributes were mistakenly stored on the linked client. When one
-- client owns multiple vessels, each vessel receives the same starting value
-- and can then be maintained independently.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'clients'
      and column_name = 'contract_management'
  ) then
    execute $copy$
      update public.vessels as vessel
      set
        contract_management = client.contract_management,
        contract_manager = client.contract_manager
      from public.clients as client
      where vessel.client_id = client.id
        and (
          client.contract_management is not null
          or client.contract_manager is not null
        )
    $copy$;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.vessels'::regclass
      and conname = 'vessels_contract_management_length_check'
  ) then
    alter table public.vessels
      add constraint vessels_contract_management_length_check
      check (contract_management is null or char_length(contract_management) <= 160);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.vessels'::regclass
      and conname = 'vessels_contract_manager_length_check'
  ) then
    alter table public.vessels
      add constraint vessels_contract_manager_length_check
      check (contract_manager is null or char_length(contract_manager) <= 120);
  end if;
end;
$$;

comment on column public.vessels.contract_management is
  'Optional contract management area or department responsible for the vessel.';

comment on column public.vessels.contract_manager is
  'Optional name of the contract manager responsible for the vessel.';
