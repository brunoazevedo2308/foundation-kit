import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env, isSupabaseConfigured } from "./env";
import type { Database } from "../types/database";

/**
 * Centralized Supabase client for DP Suite.
 *
 * Uses only the publishable (anon) key — NEVER the service_role key.
 * If the environment is not yet configured (e.g. Staging before secrets are
 * provisioned), `supabase` is `null` and features must degrade gracefully.
 */

export const supabase: SupabaseClient<Database> | null = isSupabaseConfigured
  ? createClient<Database>(env.supabaseUrl!, env.supabasePublishableKey!)
  : null;
