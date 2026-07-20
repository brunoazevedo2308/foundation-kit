import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env, isSupabaseConfigured } from "./env";

/**
 * Centralized Supabase client for DP Suite.
 *
 * Uses only the publishable (anon) key — NEVER the service_role key.
 * If the environment is not yet configured (e.g. Staging before secrets are
 * provisioned), `supabase` is `null` and features must degrade gracefully.
 */

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(env.supabaseUrl!, env.supabasePublishableKey!)
  : null;
