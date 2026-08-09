import { z } from "zod";

import { fetchCurrentOrganizationId } from "./clients";
import { emitEvent, sanitize } from "./observability";
import { supabase } from "./supabase";

/**
 * US-004 (2º ciclo) — Ações operacionais.
 *
 * Reaproveita a tabela `public.actions` já existente. Toda leitura/escrita
 * passa pela RLS (`actions_select_same_org` / `actions_insert_same_org`)
 * usando exclusivamente a chave publishable — nenhuma service_role.
 */

function client() {
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.",
    );
  }
  return supabase;
}

export const ACTION_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export const ACTION_CRITICALITIES = ["low", "medium", "high", "critical"] as const;
export const ACTION_STATUSES = [
  "open",
  "planning",
  "in_progress",
  "in_review",
  "awaiting_approval",
  "completed",
  "cancelled",
] as const;
export const ACTION_SITUATIONS = [
  "no_blockers",
  "awaiting_vessel",
  "awaiting_client",
  "awaiting_internal_team",
  "awaiting_supplier",
  "awaiting_document",
  "awaiting_approval",
  "under_analysis",
  "under_execution",
] as const;

export type ActionPriority = (typeof ACTION_PRIORITIES)[number];
export type ActionCriticality = (typeof ACTION_CRITICALITIES)[number];
export type ActionStatus = (typeof ACTION_STATUSES)[number];
export type ActionSituation = (typeof ACTION_SITUATIONS)[number];

export const ACTION_PRIORITY_LABELS: Record<ActionPriority, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  urgent: "Urgente",
};

export const ACTION_CRITICALITY_LABELS: Record<ActionCriticality, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  critical: "Crítica",
};

export const ACTION_STATUS_LABELS: Record<ActionStatus, string> = {
  open: "Aberta",
  planning: "Planejamento",
  in_progress: "Em execução",
  in_review: "Em revisão",
  awaiting_approval: "Aguardando aprovação",
  completed: "Concluída",
  cancelled: "Cancelada",
};

export const ACTION_SITUATION_LABELS: Record<ActionSituation, string> = {
  no_blockers: "Sem impedimentos",
  awaiting_vessel: "Aguardando embarcação",
  awaiting_client: "Aguardando cliente",
  awaiting_internal_team: "Aguardando time interno",
  awaiting_supplier: "Aguardando fornecedor",
  awaiting_document: "Aguardando documento",
  awaiting_approval: "Aguardando aprovação",
  under_analysis: "Em análise",
  under_execution: "Em execução",
};

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .default(null);

const optionalUuid = (message: string) =>
  z
    .string()
    .trim()
    .refine((value) => value === "" || z.string().uuid().safeParse(value).success, { message })
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .default(null);

export const ActionFormSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, "Informe o título da ação.")
    .max(160, "Máximo de 160 caracteres."),
  description: optionalText(2000, "Máximo de 2000 caracteres."),
  origin: optionalText(120, "Máximo de 120 caracteres."),
  actionType: optionalText(80, "Máximo de 80 caracteres."),
  responsibleUserId: z.string().uuid("Selecione um responsável."),
  clientId: optionalUuid("Selecione um cliente válido."),
  vesselId: optionalUuid("Selecione uma embarcação válida."),
  executionPriority: z.enum(ACTION_PRIORITIES),
  operationalCriticality: z.enum(ACTION_CRITICALITIES),
  status: z.enum(ACTION_STATUSES),
  situation: z.enum(ACTION_SITUATIONS),
  dueDate: z
    .string()
    .trim()
    .refine((value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value), {
      message: "Informe uma data válida (AAAA-MM-DD).",
    })
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .default(null),
});

export type ActionFormInput = z.input<typeof ActionFormSchema>;
export type ActionFormValues = z.output<typeof ActionFormSchema>;

export type ActionListItem = {
  id: string;
  title: string;
  description: string | null;
  origin: string | null;
  actionType: string | null;
  status: ActionStatus;
  situation: ActionSituation;
  executionPriority: ActionPriority;
  operationalCriticality: ActionCriticality;
  dueDate: string | null;
  completedAt: string | null;
  clientId: string | null;
  clientName: string | null;
  vesselId: string | null;
  vesselName: string | null;
  responsibleUserId: string;
  responsibleName: string | null;
  createdAt: string;
};

const SELECT_COLUMNS =
  "id, title, description, origin, action_type, status, situation, execution_priority, operational_criticality, due_date, completed_at, client_id, vessel_id, responsible_user_id, created_at, clients(name), vessels(name), profiles!actions_responsible_user_id_fkey(full_name)";

type Related<T> = T | T[] | null | undefined;

type ActionRow = {
  id: string;
  title: string;
  description: string | null;
  origin: string | null;
  action_type: string | null;
  status: string;
  situation: string;
  execution_priority: string;
  operational_criticality: string;
  due_date: string | null;
  completed_at: string | null;
  client_id: string | null;
  vessel_id: string | null;
  responsible_user_id: string;
  created_at: string;
  clients?: Related<{ name: string }>;
  vessels?: Related<{ name: string }>;
  profiles?: Related<{ full_name: string | null }>;
};

function one<T>(value: Related<T>): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/** Ações vencidas: due_date no passado e ainda não finalizadas. */
export function isOverdue(item: ActionListItem, today = new Date()): boolean {
  if (!item.dueDate) return false;
  if (item.status === "completed" || item.status === "cancelled") return false;
  const reference = today.toISOString().slice(0, 10);
  return item.dueDate < reference;
}

export function mapAction(row: ActionRow): ActionListItem {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    origin: row.origin,
    actionType: row.action_type,
    status: row.status as ActionStatus,
    situation: row.situation as ActionSituation,
    executionPriority: row.execution_priority as ActionPriority,
    operationalCriticality: row.operational_criticality as ActionCriticality,
    dueDate: row.due_date,
    completedAt: row.completed_at,
    clientId: row.client_id,
    clientName: one(row.clients)?.name ?? null,
    vesselId: row.vessel_id,
    vesselName: one(row.vessels)?.name ?? null,
    responsibleUserId: row.responsible_user_id,
    responsibleName: one(row.profiles)?.full_name ?? null,
    createdAt: row.created_at,
  };
}

export async function listActions(): Promise<ActionListItem[]> {
  const { data, error } = await client()
    .from("actions")
    .select(SELECT_COLUMNS)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    emitEvent({
      event_name: "backend.request.failure",
      context: { operation: "actions.list", supabase_error: sanitize(error) },
    });
    throw new Error("Não foi possível carregar as ações.");
  }

  return ((data ?? []) as ActionRow[]).map(mapAction);
}

export async function getAction(actionId: string): Promise<ActionListItem | null> {
  const { data, error } = await client()
    .from("actions")
    .select(SELECT_COLUMNS)
    .eq("id", actionId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    emitEvent({
      event_name: "backend.request.failure",
      context: { operation: "actions.get", supabase_error: sanitize(error) },
    });
    throw new Error("Não foi possível carregar a ação.");
  }

  return data ? mapAction(data as ActionRow) : null;
}

export async function createAction(input: ActionFormInput): Promise<ActionListItem> {
  const parsed = ActionFormSchema.parse(input);
  const c = client();
  const organizationId = await fetchCurrentOrganizationId();
  if (!organizationId) {
    throw new Error("Seu perfil não está vinculado a uma organização.");
  }
  const { data: authData } = await c.auth.getUser();
  if (!authData.user) {
    throw new Error("Sessão expirada. Entre novamente para criar ações.");
  }

  const { data, error } = await c
    .from("actions")
    .insert({
      organization_id: organizationId,
      client_id: parsed.clientId,
      vessel_id: parsed.vesselId,
      title: parsed.title,
      description: parsed.description,
      origin: parsed.origin,
      action_type: parsed.actionType,
      responsible_user_id: parsed.responsibleUserId,
      execution_priority: parsed.executionPriority,
      operational_criticality: parsed.operationalCriticality,
      status: parsed.status,
      situation: parsed.situation,
      due_date: parsed.dueDate,
      completed_at: parsed.status === "completed" ? new Date().toISOString() : null,
      created_by: authData.user.id,
    })
    .select(SELECT_COLUMNS)
    .single();

  if (error || !data) {
    emitEvent({
      event_name: "backend.request.failure",
      organization_id: organizationId,
      context: { operation: "actions.create", supabase_error: sanitize(error) },
    });
    throw new Error("Não foi possível cadastrar a ação agora. Tente novamente.");
  }

  return mapAction(data as ActionRow);
}
