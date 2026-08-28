import {
  ATTACHMENT_ALLOWED_MIME_TYPES,
  ATTACHMENT_MAX_BYTES,
  AttachmentStorageError,
  attachmentContextFilter,
  createAttachmentSignedUrl,
  uploadAttachment,
  validateAttachmentFile,
  type AttachmentContext,
  type AttachmentSupabaseLike,
} from "./attachment-storage";
import { fetchCurrentOrganizationId } from "./clients";
import { emitEvent, sanitize } from "./observability";
import { supabase } from "./supabase";

/**
 * US-008 (1º ciclo) — Anexos vinculados a Actions, Deliverables ou
 * Comments. Metadata em `public.attachments`, objeto no bucket privado
 * `attachments-private` (nunca `evidences-private`).
 *
 * Toda escrita usa a chave publishable + sessão do usuário; RLS é a
 * fonte da verdade. A exclusão é lógica: o objeto permanece no bucket.
 */

export {
  ATTACHMENT_ALLOWED_MIME_TYPES,
  ATTACHMENT_MAX_BYTES,
  AttachmentStorageError,
  type AttachmentContext,
};

function client() {
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.",
    );
  }
  return supabase;
}

export type AttachmentListItem = {
  id: string;
  actionId: string | null;
  deliverableId: string | null;
  commentId: string | null;
  fileName: string;
  storagePath: string;
  mimeType: string | null;
  sizeBytes: number | null;
  uploadedBy: string;
  uploadedByName: string | null;
  createdAt: string;
};

const SELECT_COLUMNS =
  "id, action_id, deliverable_id, comment_id, file_name, storage_path, mime_type, size_bytes, uploaded_by, created_at, profiles!attachments_uploaded_by_fkey(full_name)";

type Related<T> = T | T[] | null | undefined;

type AttachmentRow = {
  id: string;
  action_id: string | null;
  deliverable_id: string | null;
  comment_id: string | null;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_by: string;
  created_at: string;
  profiles?: Related<{ full_name: string | null }>;
};

function one<T>(value: Related<T>): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export function mapAttachment(row: AttachmentRow): AttachmentListItem {
  return {
    id: row.id,
    actionId: row.action_id,
    deliverableId: row.deliverable_id,
    commentId: row.comment_id,
    fileName: row.file_name,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    uploadedBy: row.uploaded_by,
    uploadedByName: one(row.profiles)?.full_name ?? null,
    createdAt: row.created_at,
  };
}

/** Formata bytes para exibição compacta na UI. */
export function formatAttachmentSize(bytes: number | null): string {
  if (bytes === null || Number.isNaN(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
  return `${(kb / 1024).toFixed(kb / 1024 < 10 ? 1 : 0)} MB`;
}

export async function listAttachments(context: AttachmentContext): Promise<AttachmentListItem[]> {
  const { column, value } = attachmentContextFilter(context);
  const { data, error } = await client()
    .from("attachments")
    .select(SELECT_COLUMNS)
    .eq(column, value)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    emitEvent({
      event_name: "backend.request.failure",
      context: { operation: "attachments.list", supabase_error: sanitize(error) },
    });
    throw new Error("Não foi possível carregar os anexos.");
  }

  return ((data ?? []) as AttachmentRow[]).map(mapAttachment);
}

export interface CreateAttachmentInput {
  context: AttachmentContext;
  file: File;
}

/** Upload metadata-first com rollback compensatório. */
export async function createAttachment(input: CreateAttachmentInput) {
  validateAttachmentFile(input.file);

  const c = client();
  const organizationId = await fetchCurrentOrganizationId();
  if (!organizationId) {
    throw new Error("Seu perfil não está vinculado a uma organização.");
  }
  const { data: authData } = await c.auth.getUser();
  if (!authData.user) {
    throw new Error("Sessão expirada. Entre novamente para enviar anexos.");
  }

  return uploadAttachment(
    {
      organizationId,
      context: input.context,
      uploadedBy: authData.user.id,
      file: input.file,
    },
    c as unknown as AttachmentSupabaseLike,
  );
}

/** Link temporário de download (120s), RLS aplicada pelo Storage. */
export async function getAttachmentDownloadUrl(storagePath: string): Promise<string> {
  return createAttachmentSignedUrl(storagePath, 120, client() as unknown as AttachmentSupabaseLike);
}

/** Soft-delete apenas do metadata; o objeto permanece no bucket. */
export async function softDeleteAttachment(attachmentId: string): Promise<void> {
  const { data, error } = await client()
    .from("attachments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", attachmentId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    emitEvent({
      event_name: "backend.request.failure",
      context: { operation: "attachments.soft_delete", supabase_error: sanitize(error) },
    });
    throw new Error("Não foi possível excluir o anexo.");
  }
}
