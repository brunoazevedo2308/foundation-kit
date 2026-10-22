import { z } from "zod";

import type { Json } from "@/types/database";
import { emitEvent, sanitize } from "./observability";
import { supabase } from "./supabase";

function client() {
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.",
    );
  }
  return supabase;
}

export const ActionActivityFormSchema = z.object({
  summary: z
    .string()
    .trim()
    .min(2, "Descreva a atualização realizada.")
    .max(500, "Máximo de 500 caracteres."),
});

export type ActionActivityItem = {
  id: string;
  actionId: string;
  actorUserId: string | null;
  actorName: string | null;
  eventType: string;
  summary: string;
  metadata: Json;
  createdAt: string;
};

type Related<T> = T | T[] | null | undefined;

type ActionActivityRow = {
  id: string;
  action_id: string;
  actor_user_id: string | null;
  event_type: string;
  summary: string;
  metadata: Json;
  created_at: string;
  profiles?: Related<{ full_name: string | null }>;
};

const SELECT_COLUMNS =
  "id, action_id, actor_user_id, event_type, summary, metadata, created_at, profiles!action_activity_actor_user_id_fkey(full_name)";

function one<T>(value: Related<T>): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export function mapActionActivity(row: ActionActivityRow): ActionActivityItem {
  return {
    id: row.id,
    actionId: row.action_id,
    actorUserId: row.actor_user_id,
    actorName: one(row.profiles)?.full_name ?? null,
    eventType: row.event_type,
    summary: row.summary,
    metadata: row.metadata,
    createdAt: row.created_at,
  };
}

const EVENT_LABELS: Readonly<Record<string, string>> = {
  "action.created": "Ação criada",
  "action.updated": "Ação atualizada",
  "action.soft_deleted": "Ação removida",
  manual_update: "Atualização registrada",
  "deliverable.created": "Entregável adicionado",
  "deliverable.updated": "Entregável atualizado",
  "deliverable.soft_deleted": "Entregável removido",
  "evidence.created": "Evidência enviada",
  "evidence.updated": "Evidência atualizada",
  "evidence.soft_deleted": "Evidência removida",
  "comment.created": "Comentário adicionado",
  "comment.updated": "Comentário atualizado",
  "comment.soft_deleted": "Comentário removido",
  "attachment.created": "Anexo enviado",
  "attachment.updated": "Anexo atualizado",
  "attachment.soft_deleted": "Anexo removido",
};

export function actionActivityLabel(eventType: string): string {
  return EVENT_LABELS[eventType] ?? "Atualização da ação";
}

export function formatActionActivityTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export async function listActionActivity(actionId: string): Promise<ActionActivityItem[]> {
  const { data, error } = await client()
    .from("action_activity")
    .select(SELECT_COLUMNS)
    .eq("action_id", actionId)
    .order("created_at", { ascending: false });

  if (error) {
    emitEvent({
      event_name: "backend.request.failure",
      context: { operation: "action_activity.list", supabase_error: sanitize(error) },
    });
    throw new Error("Não foi possível carregar o histórico da ação.");
  }

  return ((data ?? []) as ActionActivityRow[]).map(mapActionActivity);
}

export async function createManualActionActivity(
  actionId: string,
  summary: string,
): Promise<ActionActivityItem> {
  const parsed = ActionActivityFormSchema.parse({ summary });
  const { data, error } = await client()
    .from("action_activity")
    .insert({ action_id: actionId, event_type: "manual_update", summary: parsed.summary })
    .select(SELECT_COLUMNS)
    .single();

  if (error || !data) {
    emitEvent({
      event_name: "backend.request.failure",
      context: { operation: "action_activity.create", supabase_error: sanitize(error) },
    });
    throw new Error("Não foi possível registrar a atualização.");
  }

  return mapActionActivity(data as ActionActivityRow);
}
