import {
  ATTACHMENT_ALLOWED_MIME_TYPES,
  ATTACHMENT_BUCKET,
  ATTACHMENT_MAX_BYTES,
  AttachmentStorageError,
  buildAttachmentPath,
  createAttachmentSignedUrl,
  sanitizeAttachmentFilename,
  validateAttachmentFile,
  type AttachmentSupabaseLike,
} from "./attachment-storage";
import { fetchCurrentOrganizationId } from "./clients";
import { emitEvent, sanitize } from "./observability";
import { supabase } from "./supabase";

export const DOCUMENT_FILE_ALLOWED_MIME_TYPES = ATTACHMENT_ALLOWED_MIME_TYPES;
export const DOCUMENT_FILE_MAX_BYTES = ATTACHMENT_MAX_BYTES;

export const DOCUMENT_CATEGORIES = ["procedures", "forms", "trials-fmea", "documents"] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export type DocumentFileListItem = {
  id: string;
  companyId: string;
  category: DocumentCategory;
  fileName: string;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string;
  uploadedByName: string | null;
  createdAt: string;
};

type Related<T> = T | T[] | null | undefined;
type DocumentFileRow = {
  id: string;
  company_id: string;
  category: string;
  file_name: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  uploaded_by: string;
  created_at: string;
  profiles?: Related<{ full_name: string | null }>;
};

const SELECT_COLUMNS =
  "id, company_id, category, file_name, storage_path, mime_type, size_bytes, uploaded_by, created_at, profiles!document_files_uploaded_by_fkey(full_name)";

function one<T>(value: Related<T>): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function client() {
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.",
    );
  }
  return supabase;
}

export function isDocumentCategory(value: string): value is DocumentCategory {
  return DOCUMENT_CATEGORIES.includes(value as DocumentCategory);
}

export function mapDocumentFile(row: DocumentFileRow): DocumentFileListItem {
  if (!isDocumentCategory(row.category)) {
    throw new Error("Categoria documental inválida.");
  }
  return {
    id: row.id,
    companyId: row.company_id,
    category: row.category,
    fileName: row.file_name,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    uploadedBy: row.uploaded_by,
    uploadedByName: one(row.profiles)?.full_name ?? null,
    createdAt: row.created_at,
  };
}

export function formatDocumentFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
}

export async function listDocumentFiles(
  companyId: string,
  category: DocumentCategory,
): Promise<DocumentFileListItem[]> {
  const { data, error } = await client()
    .from("document_files")
    .select(SELECT_COLUMNS)
    .eq("company_id", companyId)
    .eq("category", category)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    emitEvent({
      event_name: "backend.request.failure",
      context: { operation: "document_files.list", supabase_error: sanitize(error) },
    });
    throw new Error("Não foi possível carregar os documentos.");
  }

  return ((data ?? []) as DocumentFileRow[]).map(mapDocumentFile);
}

function newUuid(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") return cryptoApi.randomUUID();
  throw new AttachmentStorageError("invalid_filename", "Não foi possível gerar o documento.");
}

export interface UploadDocumentFileInput {
  organizationId: string;
  companyId: string;
  category: DocumentCategory;
  uploadedBy: string;
  file: File;
}

export interface UploadDocumentFileResult {
  documentFileId: string;
  storagePath: string;
  fileName: string;
}

export async function uploadDocumentFile(
  input: UploadDocumentFileInput,
  storageClient: AttachmentSupabaseLike | null = supabase as AttachmentSupabaseLike | null,
): Promise<UploadDocumentFileResult> {
  if (!storageClient) {
    throw new AttachmentStorageError(
      "supabase_unavailable",
      "Serviço de documentos indisponível. Tente novamente mais tarde.",
    );
  }
  validateAttachmentFile(input.file);
  if (!isDocumentCategory(input.category)) {
    throw new AttachmentStorageError("invalid_context", "Categoria documental inválida.");
  }

  const documentFileId = newUuid();
  const fileName = sanitizeAttachmentFilename(input.file.name);
  const mimeType = input.file.type.toLowerCase();
  const storagePath = buildAttachmentPath({
    organizationId: input.organizationId,
    attachmentId: documentFileId,
    filename: fileName,
  });

  const { error: insertError } = await storageClient
    .from("document_files")
    .insert({
      id: documentFileId,
      organization_id: input.organizationId,
      company_id: input.companyId,
      category: input.category,
      file_name: fileName,
      storage_path: storagePath,
      mime_type: mimeType,
      size_bytes: input.file.size,
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
        domain: "document_file",
        stage: "metadata_insert",
        company_id: input.companyId,
        category: input.category,
        error: sanitize(insertError),
      },
    });
    throw new AttachmentStorageError(
      "metadata_insert_failed",
      "Não foi possível registrar o documento. Verifique suas permissões e tente novamente.",
      insertError,
    );
  }

  const { error: uploadError } = await storageClient.storage
    .from(ATTACHMENT_BUCKET)
    .upload(storagePath, input.file, { contentType: mimeType, upsert: false });

  if (uploadError) {
    const { error: cleanupError } = await storageClient
      .from("document_files")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", documentFileId);

    emitEvent({
      event_name: "storage.upload.failure",
      severity: cleanupError ? "critical" : "error",
      user_id: input.uploadedBy,
      organization_id: input.organizationId,
      context: {
        domain: "document_file",
        stage: cleanupError ? "cleanup_failed" : "storage_upload",
        document_file_id: documentFileId,
        upload_error: sanitize(uploadError),
        cleanup_error: sanitize(cleanupError),
      },
    });

    throw new AttachmentStorageError(
      "upload_failed",
      cleanupError
        ? "Falha ao enviar o documento. O registro ficou pendente de limpeza — contate um administrador."
        : "Falha ao enviar o documento. Tente novamente.",
      { uploadError, cleanupError },
    );
  }

  emitEvent({
    event_name: "storage.upload.success",
    user_id: input.uploadedBy,
    organization_id: input.organizationId,
    context: {
      domain: "document_file",
      document_file_id: documentFileId,
      company_id: input.companyId,
      category: input.category,
      mime_type: mimeType,
      size_bytes: input.file.size,
    },
  });

  return { documentFileId, storagePath, fileName };
}

export async function createDocumentFile(input: {
  companyId: string;
  category: DocumentCategory;
  file: File;
}): Promise<UploadDocumentFileResult> {
  validateAttachmentFile(input.file);
  const c = client();
  const organizationId = await fetchCurrentOrganizationId();
  if (!organizationId) {
    throw new Error("Seu perfil não está vinculado a uma organização.");
  }
  const { data } = await c.auth.getUser();
  if (!data.user) {
    throw new Error("Sessão expirada. Entre novamente para enviar documentos.");
  }

  return uploadDocumentFile(
    {
      organizationId,
      companyId: input.companyId,
      category: input.category,
      uploadedBy: data.user.id,
      file: input.file,
    },
    c as unknown as AttachmentSupabaseLike,
  );
}

export async function getDocumentFileDownloadUrl(storagePath: string): Promise<string> {
  return createAttachmentSignedUrl(storagePath, 120, client() as unknown as AttachmentSupabaseLike);
}
