import { supabase } from "./supabase";

/**
 * DP Suite — authentication helpers (TT-005).
 *
 * Thin wrapper around supabase-js so route components stay focused on UI.
 * All functions throw a descriptive Error when Supabase is not configured
 * for the current environment (see src/lib/env.ts).
 */

function client() {
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.",
    );
  }
  return supabase;
}

export type ProfileStatus = "active" | "inactive" | "pending";

export async function signInWithPassword(email: string, password: string) {
  const { data, error } = await client().auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await client().auth.signOut();
  if (error) throw error;
}

/**
 * Send a password-recovery e-mail. The link brings the user back to
 * `/reset-password` where a Supabase recovery session is established.
 */
export async function requestPasswordReset(email: string) {
  const redirectTo =
    typeof window !== "undefined" ? `${window.location.origin}/reset-password` : undefined;
  const { error } = await client().auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw error;
}

export async function updatePassword(newPassword: string) {
  const { error } = await client().auth.updateUser({ password: newPassword });
  if (error) throw error;
}

/**
 * Calls the `public.record_profile_login()` RPC and returns the caller's
 * `profile_status`. The RPC stamps `last_login_at` server-side when active.
 */
export async function recordProfileLogin(): Promise<ProfileStatus> {
  const { data, error } = await client().rpc("record_profile_login");
  if (error) throw error;
  return (data ?? "pending") as ProfileStatus;
}

export function humanReadableStatusError(status: ProfileStatus): string {
  switch (status) {
    case "inactive":
      return "Sua conta está inativa. Contate o administrador da organização.";
    case "pending":
      return "Seu perfil ainda não foi liberado. Aguarde a aprovação do administrador.";
    default:
      return "";
  }
}
