revoke execute on function public.create_organization(
  text,
  text,
  text,
  text,
  public.organization_status,
  text,
  text,
  text
) from anon;

revoke execute on function public.create_organization(
  text,
  text,
  text,
  text,
  public.organization_status,
  text,
  text,
  text
) from public;

grant execute on function public.create_organization(
  text,
  text,
  text,
  text,
  public.organization_status,
  text,
  text,
  text
) to authenticated;
