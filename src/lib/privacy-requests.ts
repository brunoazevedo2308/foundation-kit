import { z } from "zod";

import { emitEvent, sanitize } from "./observability";
import { supabase } from "./supabase";

function client() {
  if (!supabase) throw new Error("Backend indisponível. Contate o administrador do sistema.");
  return supabase;
}

export const REQUEST_TYPES = [
  "access",
  "correction",
  "deletion",
  "portability",
  "opposition",
  "review",
  "consent_revocation",
  "other",
] as const;

export const REQUEST_STATUSES = [
  "open",
  "in_review",
  "waiting_for_requester",
  "completed",
  "rejected",
  "cancelled",
] as const;

export type PrivacyRequestType = (typeof REQUEST_TYPES)[number];
export type PrivacyRequestStatus = (typeof REQUEST_STATUSES)[number];

export const PrivacyRequestSchema = z.object({
  requestType: z.enum(REQUEST_TYPES),
  details: z
    .string()
    .trim()
    .min(10, "Descreva sua solicitação com pelo menos 10 caracteres.")
    .max(4000, "A descrição deve ter no máximo 4.000 caracteres."),
});

export type PrivacyRequestInput = z.infer<typeof PrivacyRequestSchema>;

export type PrivacyRequest = {
  id: string;
  requesterUserId: string;
  requestType: PrivacyRequestType;
  details: string;
  status: PrivacyRequestStatus;
  responseSummary: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type PrivacyRequestRow = {
  id: string;
  requester_user_id: string;
  request_type: string;
  details: string;
  status: string;
  response_summary: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

const SELECT_COLUMNS =
  "id, requester_user_id, request_type, details, status, response_summary, resolved_at, created_at, updated_at";

export function mapPrivacyRequest(row: PrivacyRequestRow): PrivacyRequest {
  return {
    id: row.id,
    requesterUserId: row.requester_user_id,
    requestType: row.request_type as PrivacyRequestType,
    details: row.details,
    status: row.status as PrivacyRequestStatus,
    responseSummary: row.response_summary,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listPrivacyRequests(): Promise<PrivacyRequest[]> {
  const { data, error } = await client()
    .from("data_subject_requests")
    .select(SELECT_COLUMNS)
    .order("created_at", { ascending: false });

  if (error) {
    emitEvent({
      event_name: "backend.request.failure",
      context: { operation: "privacy_requests.list", supabase_error: sanitize(error) },
    });
    throw new Error("Não foi possível carregar as solicitações de privacidade.");
  }
  return ((data ?? []) as PrivacyRequestRow[]).map(mapPrivacyRequest);
}

export async function createPrivacyRequest(input: PrivacyRequestInput): Promise<PrivacyRequest> {
  const parsed = PrivacyRequestSchema.parse(input);
  const c = client();
  const { data: authData, error: authError } = await c.auth.getUser();
  if (authError || !authData.user) throw new Error("Sua sessão expirou. Entre novamente.");

  const { data: profile, error: profileError } = await c
    .from("profiles")
    .select("organization_id")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (profileError || !profile?.organization_id) {
    throw new Error("Não foi possível identificar sua organização.");
  }

  const { data, error } = await c
    .from("data_subject_requests")
    .insert({
      organization_id: profile.organization_id,
      requester_user_id: authData.user.id,
      request_type: parsed.requestType,
      details: parsed.details,
    })
    .select(SELECT_COLUMNS)
    .single();

  if (error || !data) {
    emitEvent({
      event_name: "backend.request.failure",
      context: { operation: "privacy_requests.create", supabase_error: sanitize(error) },
      user_id: authData.user.id,
    });
    throw new Error("Não foi possível registrar a solicitação de privacidade.");
  }
  return mapPrivacyRequest(data as PrivacyRequestRow);
}

export async function updatePrivacyRequest(
  requestId: string,
  status: PrivacyRequestStatus,
  responseSummary: string,
): Promise<PrivacyRequest> {
  const summary = responseSummary.trim();
  if (summary.length > 4000) throw new Error("A resposta deve ter no máximo 4.000 caracteres.");
  const resolved = ["completed", "rejected", "cancelled"].includes(status);
  const { data, error } = await client()
    .from("data_subject_requests")
    .update({
      status,
      response_summary: summary || null,
      resolved_at: resolved ? new Date().toISOString() : null,
    })
    .eq("id", requestId)
    .select(SELECT_COLUMNS)
    .single();

  if (error || !data) {
    emitEvent({
      event_name: "backend.request.failure",
      context: { operation: "privacy_requests.update", supabase_error: sanitize(error) },
    });
    throw new Error("Não foi possível atualizar a solicitação de privacidade.");
  }
  return mapPrivacyRequest(data as PrivacyRequestRow);
}

const TYPE_LABELS: Record<PrivacyRequestType, string> = {
  access: "Acesso aos dados",
  correction: "Correção de dados",
  deletion: "Exclusão de dados",
  portability: "Portabilidade",
  opposition: "Oposição ao tratamento",
  review: "Revisão de decisão automatizada",
  consent_revocation: "Revogação de consentimento",
  other: "Outra solicitação",
};

const STATUS_LABELS: Record<PrivacyRequestStatus, string> = {
  open: "Recebida",
  in_review: "Em análise",
  waiting_for_requester: "Aguardando titular",
  completed: "Concluída",
  rejected: "Indeferida",
  cancelled: "Cancelada",
};

export const privacyRequestTypeLabel = (type: PrivacyRequestType) => TYPE_LABELS[type];
export const privacyRequestStatusLabel = (status: PrivacyRequestStatus) => STATUS_LABELS[status];
