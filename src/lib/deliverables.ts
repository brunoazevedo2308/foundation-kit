import { z } from "zod";

import { fetchCurrentOrganizationId } from "./clients";
import { emitEvent, sanitize } from "./observability";
import { supabase } from "./supabase";

/**
 * US-004 (4º ciclo) — Entregáveis (deliverables) vinculados a uma Ação.
 *
 * Reaproveita `public.deliverables` já existente no Supabase (TT-003.4).
 * Toda leitura/escrita passa pela RLS multi-tenant com a chave publishable —
 * nenhuma service_role no frontend.
 */

function client() {
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.",
    );
  }
  return supabase;
}

export const DELIVERABLE_STATUSES = [
  "pending",
  "in_progress",
  "in_review",
  "completed",
  "cancelled",
] as const;

export type DeliverableStatus = (typeof DELIVERABLE_STATUSES)[number];

export const DELIVERABLE_STATUS_LABELS: Record<DeliverableStatus, string> = {
  pending: "Pendente",
  in_progress: "Em execução",
  in_review: "Em revisão",
  completed: "Concluído",
  cancelled: "Cancelado",
};

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .default(null);

export const DeliverableFormSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, "Informe o título do entregável.")
    .max(160, "Máximo de 160 caracteres."),
  description: optionalText(2000, "Máximo de 2000 caracteres."),
  responsibleUserId: z.string().uuid("Selecione um responsável."),
  status: z.enum(DELIVERABLE_STATUSES),
  dueDate: z
    .string()
    .trim()
    .refine((value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value), {
      message: "Informe uma data válida (AAAA-MM-DD).",
    })
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .default(null),
  sequenceNumber: z.coerce
    .number({ invalid_type_error: "Informe um número de ordem válido." })
    .int("A ordem deve ser um número inteiro.")
    .min(1, "A ordem deve ser maior que zero."),
});

export type DeliverableFormInput = z.input<typeof DeliverableFormSchema>;
export type DeliverableFormValues = z.output<typeof DeliverableFormSchema>;

export type DeliverableListItem = {
  id: string;
  actionId: string;
  title: string;
  description: string | null;
  status: DeliverableStatus;
  dueDate: string | null;
  completedAt: string | null;
  sequenceNumber: number;
  responsibleUserId: string;
  responsibleName: string | null;
  createdAt: string;
};

const SELECT_COLUMNS =
  "id, action_id, title, description, status, due_date, completed_at, sequence_number, responsible_user_id, created_at, profiles!deliverables_responsible_user_id_fkey(full_name)";

type Related<T> = T | T[] | null | undefined;

type DeliverableRow = {
  id: string;
  action_id: string;
  title: string;
  description: string | null;
  status: string;
  due_date: string | null;
  completed_at: string | null;
  sequence_number: number;
  responsible_user_id: string;
  created_at: string;
  profiles?: Related<{ full_name: string | null }>;
};

function one<T>(value: Related<T>): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export function mapDeliverable(row: DeliverableRow): DeliverableListItem {
  return {
    id: row.id,
    actionId: row.action_id,
    title: row.title,
    description: row.description,
    status: row.status as DeliverableStatus,
    dueDate: row.due_date,
    completedAt: row.completed_at,
    sequenceNumber: row.sequence_number,
    responsibleUserId: row.responsible_user_id,
    responsibleName: one(row.profiles)?.full_name ?? null,
    createdAt: row.created_at,
  };
}

/** Entregável vencido: prazo no passado e ainda não finalizado. */
export function isDeliverableOverdue(item: DeliverableListItem, today = new Date()): boolean {
  if (!item.dueDate) return false;
  if (item.status === "completed" || item.status === "cancelled") return false;
  return item.dueDate < today.toISOString().slice(0, 10);
}

/**
 * Mantém `deliverables_completed_at_consistency_check`:
 * `completed_at` preenchido apenas quando o status é `completed`.
 */
export function resolveDeliverableCompletedAt(
  status: DeliverableStatus,
  current: string | null,
  now = new Date(),
): string | null {
  if (status !== "completed") return null;
  return current ?? now.toISOString();
}

/** Próxima posição livre respeitando o índice único (action_id, sequence_number). */
export function nextSequenceNumber(items: DeliverableListItem[]): number {
  return items.reduce((max, item) => Math.max(max, item.sequenceNumber), 0) + 1;
}

/** Progresso derivado dos entregáveis ativos (cancelados são ignorados). */
export function deliverableProgress(items: DeliverableListItem[]): number {
  const considered = items.filter((item) => item.status !== "cancelled");
  if (considered.length === 0) return 0;
  const done = considered.filter((item) => item.status === "completed").length;
  return Math.round((done / considered.length) * 100);
}

export function toDeliverableFormInput(item: DeliverableListItem): DeliverableFormInput {
  return {
    title: item.title,
    description: item.description ?? "",
    responsibleUserId: item.responsibleUserId,
    status: item.status,
    dueDate: item.dueDate ?? "",
    sequenceNumber: item.sequenceNumber,
  };
}

export async function listDeliverables(actionId: string): Promise<DeliverableListItem[]> {
  const { data, error } = await client()
    .from("deliverables")
    .select(SELECT_COLUMNS)
    .eq("action_id", actionId)
    .is("deleted_at", null)
    .order("sequence_number", { ascending: true });

  if (error) {
    emitEvent({
      event_name: "backend.request.failure",
      context: { operation: "deliverables.list", supabase_error: sanitize(error) },
    });
    throw new Error("Não foi possível carregar os entregáveis.");
  }

  return ((data ?? []) as DeliverableRow[]).map(mapDeliverable);
}

export async function createDeliverable(
  actionId: string,
  input: DeliverableFormInput,
): Promise<DeliverableListItem> {
  const parsed = DeliverableFormSchema.parse(input);
  const c = client();
  const organizationId = await fetchCurrentOrganizationId();
  if (!organizationId) {
    throw new Error("Seu perfil não está vinculado a uma organização.");
  }
  const { data: authData } = await c.auth.getUser();
  if (!authData.user) {
    throw new Error("Sessão expirada. Entre novamente para criar entregáveis.");
  }

  const { data, error } = await c
    .from("deliverables")
    .insert({
      organization_id: organizationId,
      action_id: actionId,
      title: parsed.title,
      description: parsed.description,
      responsible_user_id: parsed.responsibleUserId,
      status: parsed.status,
      due_date: parsed.dueDate,
      sequence_number: parsed.sequenceNumber,
      completed_at: resolveDeliverableCompletedAt(parsed.status, null),
      created_by: authData.user.id,
    })
    .select(SELECT_COLUMNS)
    .single();

  if (error || !data) {
    emitEvent({
      event_name: "backend.request.failure",
      organization_id: organizationId,
      context: { operation: "deliverables.create", supabase_error: sanitize(error) },
    });
    throw new Error("Não foi possível cadastrar o entregável agora. Tente novamente.");
  }

  return mapDeliverable(data as DeliverableRow);
}

export async function updateDeliverable(
  deliverableId: string,
  input: DeliverableFormInput,
  currentCompletedAt: string | null = null,
): Promise<DeliverableListItem> {
  const parsed = DeliverableFormSchema.parse(input);

  const { data, error } = await client()
    .from("deliverables")
    .update({
      title: parsed.title,
      description: parsed.description,
      responsible_user_id: parsed.responsibleUserId,
      status: parsed.status,
      due_date: parsed.dueDate,
      sequence_number: parsed.sequenceNumber,
      completed_at: resolveDeliverableCompletedAt(parsed.status, currentCompletedAt),
    })
    .eq("id", deliverableId)
    .is("deleted_at", null)
    .select(SELECT_COLUMNS)
    .single();

  if (error || !data) {
    emitEvent({
      event_name: "backend.request.failure",
      context: { operation: "deliverables.update", supabase_error: sanitize(error) },
    });
    throw new Error("Não foi possível salvar as alterações do entregável.");
  }

  return mapDeliverable(data as DeliverableRow);
}

/** Soft-delete: DELETE físico é bloqueado pela RLS; marcamos `deleted_at`. */
export async function softDeleteDeliverable(deliverableId: string): Promise<void> {
  const { data, error } = await client()
    .from("deliverables")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", deliverableId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    emitEvent({
      event_name: "backend.request.failure",
      context: { operation: "deliverables.soft_delete", supabase_error: sanitize(error) },
    });
    throw new Error("Não foi possível excluir o entregável.");
  }
}
