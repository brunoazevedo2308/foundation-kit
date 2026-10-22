import { emitEvent, sanitize } from "./observability";
import { supabase } from "./supabase";

function client() {
  if (!supabase) throw new Error("Supabase não está configurado.");
  return supabase;
}

export type ActionParticipant = {
  userId: string;
  fullName: string | null;
  createdAt: string;
};

type ParticipantRow = {
  user_id: string;
  created_at: string;
  profiles?: { full_name: string | null } | { full_name: string | null }[] | null;
};

export async function listActionParticipants(actionId: string): Promise<ActionParticipant[]> {
  const { data, error } = await client()
    .from("action_participants")
    .select("user_id, created_at, profiles!action_participants_user_id_fkey(full_name)")
    .eq("action_id", actionId)
    .order("created_at", { ascending: true });

  if (error) {
    emitEvent({
      event_name: "backend.request.failure",
      context: { operation: "action_participants.list", supabase_error: sanitize(error) },
    });
    throw new Error("Não foi possível carregar os participantes da ação.");
  }

  return ((data ?? []) as ParticipantRow[]).map((row) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return { userId: row.user_id, fullName: profile?.full_name ?? null, createdAt: row.created_at };
  });
}

export async function replaceActionParticipants(
  actionId: string,
  requestedUserIds: string[],
): Promise<void> {
  const desired = [...new Set(requestedUserIds.filter(Boolean))];
  const current = await listActionParticipants(actionId);
  const currentIds = new Set(current.map((item) => item.userId));
  const desiredIds = new Set(desired);
  const removed = current.filter((item) => !desiredIds.has(item.userId)).map((item) => item.userId);
  const added = desired.filter((userId) => !currentIds.has(userId));

  if (removed.length > 0) {
    const { error } = await client()
      .from("action_participants")
      .delete()
      .eq("action_id", actionId)
      .in("user_id", removed);
    if (error) throw new Error("Não foi possível remover participantes da ação.");
  }

  if (added.length > 0) {
    const { error } = await client()
      .from("action_participants")
      .insert(added.map((userId) => ({ action_id: actionId, user_id: userId })));
    if (error) throw new Error("Não foi possível adicionar participantes à ação.");
  }
}
