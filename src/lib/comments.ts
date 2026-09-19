import { z } from "zod";

import { fetchCurrentOrganizationId } from "./clients";
import { emitEvent, sanitize } from "./observability";
import { supabase } from "./supabase";

/**
 * US-004 (6º ciclo) — Comentários de Ações e Entregáveis.
 *
 * Usa exclusivamente `public.comments` (TT-003.5). As policies atuais
 * (`comments_select_same_org`, `comments_insert_same_org`,
 * `comments_update_same_org`) permitem que qualquer perfil ativo da
 * organização leia e escreva comentários — `member` NÃO é somente leitura
 * aqui, ao contrário dos módulos operacionais. Nenhuma service_role é
 * usada: tudo passa pela chave publishable + sessão do usuário.
 *
 * O DELETE físico continua bloqueado pela RLS; exclusão é lógica
 * (`deleted_at`).
 */

function client() {
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.",
    );
  }
  return supabase;
}

export const CommentFormSchema = z.object({
  body: z.string().trim().min(2, "Escreva um comentário.").max(2000, "Máximo de 2000 caracteres."),
});

export type CommentFormInput = z.input<typeof CommentFormSchema>;

export type CommentListItem = {
  id: string;
  actionId: string | null;
  deliverableId: string | null;
  body: string;
  authorUserId: string;
  authorName: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Contexto exclusivo do comentário — a tabela exige exatamente um. */
export type CommentContext = { actionId: string } | { deliverableId: string };

const SELECT_COLUMNS =
  "id, action_id, deliverable_id, body, author_user_id, created_at, updated_at, profiles!comments_author_user_id_fkey(full_name)";

type Related<T> = T | T[] | null | undefined;

type CommentRow = {
  id: string;
  action_id: string | null;
  deliverable_id: string | null;
  body: string;
  author_user_id: string;
  created_at: string;
  updated_at: string;
  profiles?: Related<{ full_name: string | null }>;
};

function one<T>(value: Related<T>): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export function mapComment(row: CommentRow): CommentListItem {
  return {
    id: row.id,
    actionId: row.action_id,
    deliverableId: row.deliverable_id,
    body: row.body,
    authorUserId: row.author_user_id,
    authorName: one(row.profiles)?.full_name ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Quem pode excluir logicamente um comentário na UI: o próprio autor ou um
 * administrador. A RLS ainda permite mais que isso (qualquer membro da
 * organização), então a restrição é de produto/UX, não de segurança.
 */
export function canDeleteComment(
  comment: CommentListItem,
  currentUserId: string,
  role: string,
): boolean {
  if (comment.authorUserId === currentUserId) return true;
  return role === "system_admin" || role === "organization_admin";
}

/** Data/hora local em PT-BR; entrada inválida devolve string vazia. */
export function formatCommentTimestamp(iso: string): string {
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

function contextColumn(context: CommentContext): { column: string; value: string } {
  return "actionId" in context
    ? { column: "action_id", value: context.actionId }
    : { column: "deliverable_id", value: context.deliverableId };
}

export async function listComments(context: CommentContext): Promise<CommentListItem[]> {
  const { column, value } = contextColumn(context);
  const { data, error } = await client()
    .from("comments")
    .select(SELECT_COLUMNS)
    .eq(column, value)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (error) {
    emitEvent({
      event_name: "backend.request.failure",
      context: { operation: "comments.list", supabase_error: sanitize(error) },
    });
    throw new Error("Não foi possível carregar os comentários.");
  }

  return ((data ?? []) as CommentRow[]).map(mapComment);
}

export async function createComment(
  context: CommentContext,
  input: CommentFormInput,
): Promise<CommentListItem> {
  const parsed = CommentFormSchema.parse(input);
  const c = client();
  const organizationId = await fetchCurrentOrganizationId();
  if (!organizationId) {
    throw new Error("Seu perfil não está vinculado a uma organização.");
  }
  const { data: authData } = await c.auth.getUser();
  if (!authData.user) {
    throw new Error("Sessão expirada. Entre novamente para comentar.");
  }

  const contextValues =
    "actionId" in context
      ? { action_id: context.actionId }
      : { deliverable_id: context.deliverableId };
  const { data, error } = await c
    .from("comments")
    .insert({
      organization_id: organizationId,
      ...contextValues,
      author_user_id: authData.user.id,
      body: parsed.body,
    })
    .select(SELECT_COLUMNS)
    .single();

  if (error || !data) {
    emitEvent({
      event_name: "backend.request.failure",
      organization_id: organizationId,
      context: { operation: "comments.create", supabase_error: sanitize(error) },
    });
    throw new Error("Não foi possível publicar o comentário agora. Tente novamente.");
  }

  return mapComment(data as CommentRow);
}

/** Soft-delete: DELETE físico é bloqueado pela RLS; marcamos `deleted_at`. */
export async function softDeleteComment(commentId: string): Promise<void> {
  const { data, error } = await client()
    .from("comments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", commentId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    emitEvent({
      event_name: "backend.request.failure",
      context: { operation: "comments.soft_delete", supabase_error: sanitize(error) },
    });
    throw new Error("Não foi possível excluir o comentário.");
  }
}
