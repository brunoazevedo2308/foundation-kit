import { supabase } from "./supabase";

/**
 * DP Suite — authentication helpers (TT-005).
 *
 * Thin wrapper around supabase-js. All user-facing error messages are
 * generic Portuguese strings — raw Supabase error text is never surfaced
 * to route components. Profile lifecycle uses the backlog-approved values
 * `active | inactive | blocked`. Any missing/soft-deleted profile is
 * reported as `blocked`.
 */

function client() {
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.",
    );
  }
  return supabase;
}

export type ProfileStatus = "active" | "inactive" | "blocked";

export async function signInWithPassword(email: string, password: string) {
  const { data, error } = await client().auth.signInWithPassword({ email, password });
  if (error) {
    // Never leak Supabase error text. Any credential failure surfaces the
    // same message to prevent user enumeration.
    throw new Error("E-mail ou senha inválidos.");
  }
  return data;
}

export async function signOut() {
  const { error } = await client().auth.signOut();
  if (error) {
    throw new Error("Não foi possível encerrar a sessão.");
  }
}

/**
 * Send a password-recovery e-mail. The link brings the user back to
 * `/reset-password` where a Supabase recovery session is established.
 */
export async function requestPasswordReset(email: string) {
  const redirectTo =
    typeof window !== "undefined" ? `${window.location.origin}/reset-password` : undefined;
  const { error } = await client().auth.resetPasswordForEmail(email, { redirectTo });
  if (error) {
    throw new Error("Não foi possível solicitar a recuperação. Tente novamente.");
  }
}

export async function updatePassword(newPassword: string) {
  const { error } = await client().auth.updateUser({ password: newPassword });
  if (error) {
    throw new Error("Não foi possível atualizar a senha.");
  }
}

/**
 * Calls `public.record_profile_login()` and returns the caller's
 * `profile_status`. The RPC (SECURITY INVOKER) stamps `last_login_at`
 * server-side when the profile is active. Any RPC failure is treated as
 * `blocked` — the app must never leak the user into protected content
 * on ambiguous outcomes.
 */
export async function recordProfileLogin(): Promise<ProfileStatus> {
  const { data, error } = await client().rpc("record_profile_login");
  if (error) return "blocked";
  return (data ?? "blocked") as ProfileStatus;
}

/**
 * Revalidates a restored session. Reads the caller's `profiles.status`
 * under RLS (no side-effects — does NOT stamp last_login_at). A missing
 * or soft-deleted row is invisible to the caller and reported as
 * `blocked`, so an account demoted after a previous login is denied
 * access before any protected content renders.
 */
export async function fetchProfileStatus(userId: string): Promise<ProfileStatus> {
  const { data, error } = await client()
    .from("profiles")
    .select("status")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return "blocked";
  return data.status as ProfileStatus;
}

/**
 * Loads the display data shown on protected surfaces: profile full name +
 * organization name. Both are RLS-scoped to the caller. Returns nulls when
 * a value is unavailable so the UI can degrade gracefully.
 */
export async function fetchProfileHeader(
  userId: string,
): Promise<{ fullName: string | null; organizationName: string | null }> {
  const c = client();
  const { data: profile, error: profileError } = await c
    .from("profiles")
    .select("full_name, organization_id")
    .eq("id", userId)
    .maybeSingle();
  if (profileError || !profile) return { fullName: null, organizationName: null };

  let organizationName: string | null = null;
  if (profile.organization_id) {
    const { data: org } = await c
      .from("organizations")
      .select("name")
      .eq("id", profile.organization_id)
      .maybeSingle();
    organizationName = org?.name ?? null;
  }
  return { fullName: profile.full_name ?? null, organizationName };
}

export function humanReadableStatusError(status: ProfileStatus): string {
  switch (status) {
    case "inactive":
      return "Sua conta está inativa. Contate o administrador da organização.";
    case "blocked":
      return "Seu acesso está bloqueado. Contate o administrador da organização.";
    default:
      return "";
  }
}
