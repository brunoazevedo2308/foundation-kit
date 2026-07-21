import { emitEvent, maskSignedUrl, sanitize } from "./observability";
import { supabase } from "./supabase";

/**
 * DP Suite — Evidence storage module (TT-007).
 *
 * Handles private uploads to the `evidences-private` bucket, distinct
 * from Attachments. Follows a strict metadata-first, path-canonical flow
 * enforced by storage RLS on the backend.
 *
 * Canonical object path:
 *   organization/{organization_id}/actions/{action_id}/deliverables/{deliverable_id}/evidences/{evidence_id}/{filename}
 *
 * Versioning: this module never overwrites. A new file version = a new
 * Evidence row (new id + new path). Previous versions remain historical
 * and readable (see docs/evidences-versioning.md).
 */

export const EVIDENCE_BUCKET = "evidences-private";
export const EVIDENCE_MAX_BYTES = 50 * 1024 * 1024; // 50 MiB
export const EVIDENCE_ALLOWED_MIME_TYPES: readonly string[] = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;

export type EvidenceErrorCode =
  | "invalid_filename"
  | "file_too_large"
  | "mime_not_allowed"
  | "supabase_unavailable"
  | "metadata_insert_failed"
  | "upload_failed"
  | "signed_url_failed"
  | "not_found";

export class EvidenceStorageError extends Error {
  readonly code: EvidenceErrorCode;
  readonly cause?: unknown;
  constructor(code: EvidenceErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "EvidenceStorageError";
    this.code = code;
    this.cause = cause;
  }
}

export interface EvidencePathInput {
  organizationId: string;
  actionId: string;
  deliverableId: string;
  evidenceId: string;
  filename: string;
}

/**
 * Sanitize an incoming filename to a safe, single-segment string.
 * - Strips path components (both `/` and `\`) — attackers cannot escape
 *   the canonical directory.
 * - Strips control chars and NUL bytes.
 * - Collapses whitespace, replaces disallowed characters with `_`.
 * - Preserves a single dot before the extension.
 * - Enforces a 180-char cap; empty/dotfile-only names are rejected.
 */
export function sanitizeEvidenceFilename(raw: string): string {
  if (typeof raw !== "string") {
    throw new EvidenceStorageError("invalid_filename", "Nome de arquivo inválido.");
  }
  // Take the last segment if the caller passed a path.
  const lastSlash = Math.max(raw.lastIndexOf("/"), raw.lastIndexOf("\\"));
  let name = lastSlash >= 0 ? raw.slice(lastSlash + 1) : raw;
  // Remove control chars (incl. NUL) and normalize whitespace.
  // eslint-disable-next-line no-control-regex
  name = name.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!name || name === "." || name === "..") {
    throw new EvidenceStorageError("invalid_filename", "Nome de arquivo inválido.");
  }
  // Split extension (last dot only), keep alnum/dash/underscore, replace the rest.
  const dotIdx = name.lastIndexOf(".");
  const base = (dotIdx > 0 ? name.slice(0, dotIdx) : name).replace(/[^A-Za-z0-9._-]+/g, "_");
  const extRaw = dotIdx > 0 ? name.slice(dotIdx + 1) : "";
  const ext = extRaw.replace(/[^A-Za-z0-9]+/g, "").toLowerCase();
  const trimmedBase = base.replace(/^[._-]+/, "").replace(/[._-]+$/, "") || "arquivo";
  const finalName = ext ? `${trimmedBase}.${ext}` : trimmedBase;
  if (finalName.length > 180) {
    // Preserve extension when truncating.
    const keep = ext ? 180 - (ext.length + 1) : 180;
    const truncated = trimmedBase.slice(0, Math.max(1, keep));
    return ext ? `${truncated}.${ext}` : truncated;
  }
  return finalName;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUuid(value: string, field: string): void {
  if (typeof value !== "string" || !UUID_RE.test(value)) {
    throw new EvidenceStorageError("invalid_filename", `Identificador inválido: ${field}.`);
  }
}

/** Build the canonical storage path. Inputs must be UUIDs. */
export function buildEvidencePath(input: EvidencePathInput): string {
  assertUuid(input.organizationId, "organizationId");
  assertUuid(input.actionId, "actionId");
  assertUuid(input.deliverableId, "deliverableId");
  assertUuid(input.evidenceId, "evidenceId");
  const filename = sanitizeEvidenceFilename(input.filename);
  return `organization/${input.organizationId}/actions/${input.actionId}/deliverables/${input.deliverableId}/evidences/${input.evidenceId}/${filename}`;
}

export interface EvidenceFileLike {
  name: string;
  size: number;
  type: string;
}

/** Validate size + MIME before touching the network. */
export function validateEvidenceFile(file: EvidenceFileLike): void {
  if (!file || typeof file.size !== "number") {
    throw new EvidenceStorageError("invalid_filename", "Arquivo inválido.");
  }
  if (file.size <= 0) {
    throw new EvidenceStorageError("invalid_filename", "Arquivo vazio não é permitido.");
  }
  if (file.size > EVIDENCE_MAX_BYTES) {
    throw new EvidenceStorageError(
      "file_too_large",
      `Arquivo excede o limite de ${EVIDENCE_MAX_BYTES / (1024 * 1024)} MB.`,
    );
  }
  const mime = (file.type || "").toLowerCase();
  if (!EVIDENCE_ALLOWED_MIME_TYPES.includes(mime)) {
    throw new EvidenceStorageError("mime_not_allowed", "Tipo de arquivo não permitido.");
  }
}

// -----------------------------------------------------------------------------
// Transactional upload with compensating cleanup
// -----------------------------------------------------------------------------

// Minimal structural type of the Supabase client parts this module uses.
// Kept internal so tests can pass a lightweight mock without stubbing the
// full @supabase/supabase-js surface.
export interface EvidenceSupabaseLike {
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

export interface UploadEvidenceInput {
  organizationId: string;
  actionId: string;
  deliverableId: string;
  title: string;
  description?: string | null;
  versionNumber?: number;
  uploadedBy: string;
  file: File;
}

export interface UploadEvidenceResult {
  evidenceId: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  versionNumber: number;
}

/**
 * Generate a UUIDv4 using the browser/Web Crypto API. Kept internal so the
 * module has zero runtime dependencies on `uuid`.
 */
function newUuid(): string {
  const c: Crypto | undefined =
    typeof globalThis !== "undefined" ? (globalThis as { crypto?: Crypto }).crypto : undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  // Fallback: RFC4122 v4 using getRandomValues.
  const bytes = new Uint8Array(16);
  (c ?? { getRandomValues: () => bytes }).getRandomValues!(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const h = (n: number) => n.toString(16).padStart(2, "0");
  const b = Array.from(bytes, h).join("");
  return `${b.slice(0, 8)}-${b.slice(8, 12)}-${b.slice(12, 16)}-${b.slice(16, 20)}-${b.slice(20)}`;
}

/**
 * Metadata-first upload. Steps:
 *   1. Generate a new Evidence UUID and canonical path.
 *   2. Insert the metadata row in `public.evidences` (RLS-scoped).
 *   3. Upload the object to `evidences-private` (RLS re-validates the row).
 *   4. If the upload fails, soft-delete the metadata row so no orphan
 *      metadata pollutes the table and the unique-version index stays
 *      free for a retry.
 */
export async function uploadEvidence(
  input: UploadEvidenceInput,
  client: EvidenceSupabaseLike | null = supabase as EvidenceSupabaseLike | null,
): Promise<UploadEvidenceResult> {
  if (!client) {
    throw new EvidenceStorageError(
      "supabase_unavailable",
      "Serviço de storage indisponível. Tente novamente mais tarde.",
    );
  }
  validateEvidenceFile(input.file);

  const evidenceId = newUuid();
  const fileName = sanitizeEvidenceFilename(input.file.name);
  const storagePath = buildEvidencePath({
    organizationId: input.organizationId,
    actionId: input.actionId,
    deliverableId: input.deliverableId,
    evidenceId,
    filename: fileName,
  });
  const mimeType = input.file.type.toLowerCase();
  const sizeBytes = input.file.size;
  const versionNumber = input.versionNumber ?? 1;

  const { error: insertError } = await client
    .from("evidences")
    .insert({
      id: evidenceId,
      organization_id: input.organizationId,
      deliverable_id: input.deliverableId,
      title: input.title,
      description: input.description ?? null,
      storage_path: storagePath,
      file_name: fileName,
      mime_type: mimeType,
      size_bytes: sizeBytes,
      version_number: versionNumber,
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
        stage: "metadata_insert",
        file_name: fileName,
        mime_type: mimeType,
        size_bytes: sizeBytes,
        error: sanitize(insertError),
      },
    });
    throw new EvidenceStorageError(
      "metadata_insert_failed",
      "Não foi possível registrar a evidência. Verifique suas permissões e tente novamente.",
      insertError,
    );
  }

  const { error: uploadError } = await client.storage
    .from(EVIDENCE_BUCKET)
    .upload(storagePath, input.file, { contentType: mimeType, upsert: false });

  if (uploadError) {
    // Compensating action: soft-delete the metadata row so we don't leave
    // orphan metadata behind. We never call service_role from the browser.
    emitEvent({
      event_name: "storage.upload.compensating_cleanup",
      user_id: input.uploadedBy,
      organization_id: input.organizationId,
      context: {
        evidence_id: evidenceId,
        file_name: fileName,
        upload_error: sanitize(uploadError),
      },
    });
    const { error: cleanupError } = await client
      .from("evidences")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", evidenceId);
    if (cleanupError) {
      emitEvent({
        event_name: "storage.upload.failure",
        severity: "critical",
        user_id: input.uploadedBy,
        organization_id: input.organizationId,
        context: {
          stage: "cleanup_failed",
          evidence_id: evidenceId,
          upload_error: sanitize(uploadError),
          cleanup_error: sanitize(cleanupError),
        },
      });
      throw new EvidenceStorageError(
        "upload_failed",
        "Falha ao enviar o arquivo. A evidência ficou pendente de limpeza — contate um administrador.",
        { uploadError, cleanupError },
      );
    }
    emitEvent({
      event_name: "storage.upload.failure",
      user_id: input.uploadedBy,
      organization_id: input.organizationId,
      context: {
        stage: "storage_upload",
        evidence_id: evidenceId,
        file_name: fileName,
        error: sanitize(uploadError),
      },
    });
    throw new EvidenceStorageError(
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
      evidence_id: evidenceId,
      file_name: fileName,
      mime_type: mimeType,
      size_bytes: sizeBytes,
      version_number: versionNumber,
    },
  });

  return {
    evidenceId,
    storagePath,
    fileName,
    mimeType,
    sizeBytes,
    versionNumber,
  };
}

/**
 * Create a short-lived signed URL for downloading an evidence object.
 * Default TTL is 60 seconds; caller may raise it up to 3600 (1 hour).
 */
export async function createEvidenceSignedUrl(
  storagePath: string,
  expiresInSeconds: number = 60,
  client: EvidenceSupabaseLike | null = supabase as EvidenceSupabaseLike | null,
): Promise<string> {
  if (!client) {
    throw new EvidenceStorageError(
      "supabase_unavailable",
      "Serviço de storage indisponível. Tente novamente mais tarde.",
    );
  }
  const ttl = Math.min(Math.max(expiresInSeconds, 10), 3600);
  const { data, error } = await client.storage
    .from(EVIDENCE_BUCKET)
    .createSignedUrl(storagePath, ttl);
  if (error || !data?.signedUrl) {
    emitEvent({
      event_name: "storage.signed_url.failure",
      context: { storage_path: storagePath, error: sanitize(error) },
    });
    throw new EvidenceStorageError(
      "signed_url_failed",
      "Não foi possível gerar o link de download.",
      error,
    );
  }
  // Sucesso silencioso: nunca logamos a URL completa. Se for útil ao
  // diagnóstico, emita manualmente `maskSignedUrl(data.signedUrl)`.
  void maskSignedUrl;
  return data.signedUrl;
}
