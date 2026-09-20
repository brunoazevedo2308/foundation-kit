-- Migration: TT-003.6 — Harden function search paths
-- Reason: Supabase Security Advisor flagged function_search_path_mutable on
-- public.set_updated_at() and public.prevent_audit_event_mutation().
-- This migration locks the search_path for both functions without altering
-- any previously applied migration.

ALTER FUNCTION public.set_updated_at() SET search_path = pg_catalog, public;
ALTER FUNCTION public.prevent_audit_event_mutation() SET search_path = pg_catalog, public;
