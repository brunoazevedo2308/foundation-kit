-- Defense-in-depth hardening for the private authorization helper.
--
-- public.create_organization() remains the intentional authenticated API entry point.
-- It is SECURITY DEFINER with a fixed search_path and performs an explicit
-- private.is_system_admin() authorization check before any write.
--
-- The private helper itself does not need to be directly callable by ordinary
-- authenticated clients, so remove that unnecessary privilege.

revoke execute on function private.is_system_admin() from authenticated;
grant execute on function private.is_system_admin() to postgres, service_role;
