import { emitEvent, sanitize } from "./observability";
import { supabase } from "./supabase";

/**
 * DP Suite — Attachment storage module (US-008, 1º ciclo).
 *
 * Domínio **separado** de Evidences: bucket próprio, caminho próprio,
 * policies próprias. Nunca reutilize `evidences-private` para anexos.
 *
 * Caminho canônico (tenant-scoped):
 *   {organization_id}/{attachment_id}/{safe_file_name}
 *
 * Fluxo metadata-first: a linha em `public.attachments` é criada antes do
 * objeto; se o upload falhar, o metadata é soft-deletado (compensação).
 * O frontend nunca faz UPDATE/DELETE físico no Storage e nunca usa
 * service_role.
 */

export const ATTACHMENT_BUCKET = "attachments-private";
export const ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024; // 25 MiB
export const ATTACHMENT_ALLOWED_MIME_TYPES: readonly string[] = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;

export type AttachmentErrorCode =
  | "invalid_filename"
  | "invalid_context"
  | "file_too_large"
  | "mime_not_allowed"
  | "supabase_unavailable"
  | "metadata_insert_failed"
  | "upload_failed"
  | "signed_url_failed";

export class AttachmentStorageError extends Error {
  readonly code: AttachmentErrorCode;
  readonly cause?: unknown;
  constructor(code: AttachmentErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "AttachmentStorageError";
    this.code = code;
    this.cause = cause;
  }
}

/**
 * Normaliza o nome do arquivo para um único segmento seguro.
 * Mesmas garantias do módulo de evidências (sem travessia de diretório,
 * sem control chars, extensão única em minúsculas, teto de 180 chars).
 */
export function sanitizeAttachmentFilename(raw: string): string {
  if (typeof raw !== "string") {
    throw new AttachmentStorageError("invalid_filename", "Nome de arquivo inválido.");
  }
  const lastSlash = Math.max(raw.lastIndexOf("/"), raw.lastIndexOf("\\"));
  let name = lastSlash >= 0 ? raw.slice(lastSlash + 1) : raw;
  // eslint-disable-next-line no-control-regex
  name = name.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!name || name === "." || name === "..") {
    throw new AttachmentStorageError("invalid_filename", "Nome de arquivo inválido.");
  }
  const dotIdx = name.lastIndexOf(".");
  const base = (dotIdx > 0 ? name.slice(0, dotIdx) : name).replace(/[^A-Za-z0-9._-]+/g, "_");
  const extRaw = dotIdx > 0 ? name.slice(dotIdx + 1) : "";
  const ext = extRaw.replace(/[^A-Za-z0-9]+/g, "").toLowerCase();
  const trimmedBase = base.replace(/^[._-]+/, "").replace(/[._-]+$/, "") || "arquivo";
  const finalName = ext ? `${trimmedBase}.${ext}` : trimmedBase;
  if (finalName.length > 180) {
    const keep = ext ? 180 - (ext.length + 1) : 180;
    const truncated = trimmedBase.slice(0, Math.max(1, keep));
    return ext ? `${truncated}.${ext}` : truncated;
  }
  return finalName;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUuid(value: string, field: string): void {
  if (typeof value !== "string" || !UUID_RE.test(value)) {
    throw new AttachmentStorageError("invalid_filename", `Identificador inválido: ${field}.`);
  }
}

export interface AttachmentPathInput {
  organizationId: string;
  attachmentId: string;
  filename: string;
}

/** Caminho canônico: `{organization_id}/{attachment_id}/{safe_file_name}`. */
export function buildAttachmentPath(input: AttachmentPathInput): string {
  assertUuid(input.organizationId, "organizationId");
  assertUuid(input.attachmentId, "attachmentId");
  const filename = sanitizeAttachmentFilename(input.filename);
  return `${input.organizationId}/${input.attachmentId}/${filename}`;
}

export interface AttachmentFileLike {
  name: string;
  size: number;
  type: string;
}

/** Valida tamanho + MIME antes de qualquer chamada de rede. */
export function validateAttachmentFile(file: AttachmentFileLike): void {
  if (!file || typeof file.size !== "number") {
    throw new AttachmentStorageError("invalid_filename", "Arquivo inválido.");
  }
  if (file.size <= 0) {
    throw new AttachmentStorageError("invalid_filename", "Arquivo vazio não é permitido.");
  }
  if (file.size > ATTACHMENT_MAX_BYTES) {
    throw new AttachmentStorageError(
      "file_too_large",
      `Arquivo excede o limite de ${ATTACHMENT_MAX_BYTES / (1024 * 1024)} MB.`,
    );
  }
  const mime = (file.type || "").toLowerCase();
  if (!ATTACHMENT_ALLOWED_MIME_TYPES.includes(mime)) {
    throw new AttachmentStorageError("mime_not_allowed", "Tipo de arquivo não permitido.");
  }
}

// -----------------------------------------------------------------------------
// Vínculo (exatamente um dos três)
// -----------------------------------------------------------------------------

export type AttachmentContext =
  { actionId: string } | { deliverableId: string } | { commentId: string };

export interface AttachmentLinkColumns {
  action_id: string | null;
  deliverable_id: string | null;
  comment_id: string | null;
}

/** Converte o contexto de UI nas colunas de vínculo de `public.attachments`. */
export function attachmentLinkColumns(context: AttachmentContext): AttachmentLinkColumns {
  if ("actionId" in context) {
    assertUuid(context.actionId, "actionId");
    return { action_id: context.actionId, deliverable_id: null, comment_id: null };
  }
  if ("deliverableId" in context) {
    assertUuid(context.deliverableId, "deliverableId");
    return { action_id: null, deliverable_id: context.deliverableId, comment_id: null };
  }
  if ("commentId" in context) {
    assertUuid(context.commentId, "commentId");
    return { action_id: null, deliverable_id: null, comment_id: context.commentId };
  }
  throw new AttachmentStorageError("invalid_context", "Vínculo de anexo inválido.");
}

/** Coluna/valor usados na listagem filtrada por contexto. */
export function attachmentContextFilter(context: AttachmentContext): {
  column: string;
  value: string;
} {
  const cols = attachmentLinkColumns(context);
  if (cols.action_id) return { column: "action_id", value: cols.action_id };
  if (cols.deliverable_id) return { column: "deliverable_id", value: cols.deliverable_id };
  return { column: "comment_id", value: cols.comment_id! };
}

// -----------------------------------------------------------------------------
// Upload transacional com compensação
// -----------------------------------------------------------------------------

export interface AttachmentSupabaseLike {
  from: (table: string) => {
    insert: (row: Record<string, unknown>) => {
      select: (columns: string) => { single: () => Promise<{ data: unknown; error: unknown }> };
    };
    update: (row: Record<string, unknown>) => {
      eq: (col: string, val: unknown) => Promise<{ error: unknown }>;
    };
  };
  storage: {
    from: (bucket: string) => {
      upload: (
        path: string,
        body: Blob | ArrayBuffer | Uint8Array | File,
        opts?: { contentType?: string; upsert?: boolean },
      ) => Promise<{ data: unknown; error: unknown }>;
      createSignedUrl: (
        path: string,
        expiresIn: number,
      ) => Promise<{ data: { signedUrl: string } | null; error: unknown }>;
    };
  };
}

function newUuid(): string {
  const c: Crypto | undefined =
    typeof globalThis !== "undefined" ? (globalThis as { crypto?: Crypto }).crypto : undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const bytes = new Uint8Array(16);
  (c ?? { getRandomValues: () => bytes }).getRandomValues!(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const h = (n: number) => n.toString(16).padStart(2, "0");
  const b = Array.from(bytes, h).join("");
  return `${b.slice(0, 8)}-${b.slice(8, 12)}-${b.slice(12, 16)}-${b.slice(16, 20)}-${b.slice(20)}`;
}

export interface UploadAttachmentInput {
  organizationId: string;
  context: AttachmentContext;
  uploadedBy: string;
  file: File;
}

export interface UploadAttachmentResult {
  attachmentId: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

/**
 * Upload metadata-first:
 *   1. Gera o UUID do anexo e o caminho canônico.
 *   2. INSERT em `public.attachments` (RLS + trigger de integridade).
 *   3. POST do objeto em `attachments-private` (RLS revalida a linha).
 *   4. Se (3) falhar, soft-delete do metadata inserido em (2).
 */
export async function uploadAttachment(
  input: UploadAttachmentInput,
  client: AttachmentSupabaseLike | null = supabase as AttachmentSupabaseLike | null,
): Promise<UploadAttachmentResult> {
  if (!client) {
    throw new AttachmentStorageError(
      "supabase_unavailable",
      "Serviço de storage indisponível. Tente novamente mais tarde.",
    );
  }
  validateAttachmentFile(input.file);

  const fileName = sanitizeAttachmentFilename(input.file.name);
  const mimeType = input.file.type.toLowerCase();
  const sizeBytes = input.file.size;
  const links = attachmentLinkColumns(input.context);

  const attachmentId = newUuid();
  const storagePath = buildAttachmentPath({
    organizationId: input.organizationId,
    attachmentId,
    filename: fileName,
  });

  const { error: insertError } = await client
    .from("attachments")
    .insert({
      id: attachmentId,
      organization_id: input.organizationId,
      ...links,
      file_name: fileName,
      storage_path: storagePath,
      mime_type: mimeType,
      size_bytes: sizeBytes,
      uploaded_by: input.uploadedBy,
    })
    .select("id")
    .single();

  if (insertError) {
    emitEvent({
      event_name: "storage.upload.failure",
      user_id: input.uploadedBy,
      organization_id: input.organizationId,
      context: {
        domain: "attachment",
        stage: "metadata_insert",
        file_name: fileName,
        mime_type: mimeType,
        size_bytes: sizeBytes,
        error: sanitize(insertError),
      },
    });
    throw new AttachmentStorageError(
      "metadata_insert_failed",
      "Não foi possível registrar o anexo. Verifique suas permissões e tente novamente.",
      insertError,
    );
  }

  const { error: uploadError } = await client.storage
    .from(ATTACHMENT_BUCKET)
    .upload(storagePath, input.file, { contentType: mimeType, upsert: false });

  if (uploadError) {
    emitEvent({
      event_name: "storage.upload.compensating_cleanup",
      user_id: input.uploadedBy,
      organization_id: input.organizationId,
      context: {
        domain: "attachment",
        attachment_id: attachmentId,
        file_name: fileName,
        upload_error: sanitize(uploadError),
      },
    });
    const { error: cleanupError } = await client
      .from("attachments")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", attachmentId);

    if (cleanupError) {
      emitEvent({
        event_name: "storage.upload.failure",
        severity: "critical",
        user_id: input.uploadedBy,
        organization_id: input.organizationId,
        context: {
          domain: "attachment",
          stage: "cleanup_failed",
          attachment_id: attachmentId,
          upload_error: sanitize(uploadError),
          cleanup_error: sanitize(cleanupError),
        },
      });
      throw new AttachmentStorageError(
        "upload_failed",
        "Falha ao enviar o arquivo. O anexo ficou pendente de limpeza — contate um administrador.",
        { uploadError, cleanupError },
      );
    }

    emitEvent({
      event_name: "storage.upload.failure",
      user_id: input.uploadedBy,
      organization_id: input.organizationId,
      context: {
        domain: "attachment",
        stage: "storage_upload",
        attachment_id: attachmentId,
        file_name: fileName,
        error: sanitize(uploadError),
      },
    });
    throw new AttachmentStorageError(
      "upload_failed",
      "Falha ao enviar o arquivo. Tente novamente.",
      uploadError,
    );
  }

  emitEvent({
    event_name: "storage.upload.success",
    user_id: input.uploadedBy,
    organization_id: input.organizationId,
    context: {
      domain: "attachment",
      attachment_id: attachmentId,
      file_name: fileName,
      mime_type: mimeType,
      size_bytes: sizeBytes,
    },
  });

  return { attachmentId, storagePath, fileName, mimeType, sizeBytes };
}

/** Signed URL curta para download (padrão 120s, teto de 1h). */
export async function createAttachmentSignedUrl(
  storagePath: string,
  expiresInSeconds: number = 120,
  client: AttachmentSupabaseLike | null = supabase as AttachmentSupabaseLike | null,
): Promise<string> {
  if (!client) {
    throw new AttachmentStorageError(
      "supabase_unavailable",
      "Serviço de storage indisponível. Tente novamente mais tarde.",
    );
  }
  const ttl = Math.min(Math.max(expiresInSeconds, 10), 3600);
  const { data, error } = await client.storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUrl(storagePath, ttl);
  if (error || !data?.signedUrl) {
    emitEvent({
      event_name: "storage.signed_url.failure",
      context: { domain: "attachment", storage_path: storagePath, error: sanitize(error) },
    });
    throw new AttachmentStorageError(
      "signed_url_failed",
      "Não foi possível gerar o link de download.",
      error,
    );
  }
  // Nunca logamos a URL assinada completa.
  return data.signedUrl;
}
