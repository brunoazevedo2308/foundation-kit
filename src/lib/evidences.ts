import { fetchCurrentOrganizationId } from "./clients";
import {
  EVIDENCE_ALLOWED_MIME_TYPES,
  EVIDENCE_MAX_BYTES,
  EvidenceStorageError,
  createEvidenceSignedUrl,
  sanitizeEvidenceFilename,
  uploadEvidence,
  validateEvidenceFile,
  type EvidenceSupabaseLike,
} from "./evidence-storage";
import { emitEvent, sanitize } from "./observability";
import { supabase } from "./supabase";

/**
 * US-004 (5º ciclo) — Evidências vinculadas a Deliverables.
 *
 * Reaproveita `public.evidences` (TT-003.5) e o bucket privado
 * `evidences-private` (TT-007). Toda escrita usa a chave publishable +
 * sessão do usuário — nenhuma service_role no frontend.
 *
 * Imutabilidade: `storage_path` nunca é reescrito. Nova versão = nova row
 * (novo id + novo path), preservando o histórico. A remoção é lógica
 * (`deleted_at`), o objeto permanece no bucket para auditoria.
 */

export { EVIDENCE_ALLOWED_MIME_TYPES, EVIDENCE_MAX_BYTES, EvidenceStorageError };

function client() {
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.",
    );
  }
  return supabase;
}

export type EvidenceListItem = {
  id: string;
  deliverableId: string;
  title: string;
  description: string | null;
  storagePath: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  versionNumber: number;
  uploadedBy: string;
  uploadedByName: string | null;
  createdAt: string;
};

const SELECT_COLUMNS =
  "id, deliverable_id, title, description, storage_path, file_name, mime_type, size_bytes, version_number, uploaded_by, created_at, profiles!evidences_uploaded_by_fkey(full_name)";

type Related<T> = T | T[] | null | undefined;

type EvidenceRow = {
  id: string;
  deliverable_id: string;
  title: string;
  description: string | null;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  version_number: number;
  uploaded_by: string;
  created_at: string;
  profiles?: Related<{ full_name: string | null }>;
};

function one<T>(value: Related<T>): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export function mapEvidence(row: EvidenceRow): EvidenceListItem {
  return {
    id: row.id,
    deliverableId: row.deliverable_id,
    title: row.title,
    description: row.description,
    storagePath: row.storage_path,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    versionNumber: row.version_number,
    uploadedBy: row.uploaded_by,
    uploadedByName: one(row.profiles)?.full_name ?? null,
    createdAt: row.created_at,
  };
}

/** Formata bytes para exibição compacta na UI. */
export function formatFileSize(bytes: number | null): string {
  if (bytes === null || Number.isNaN(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
  return `${(kb / 1024).toFixed(kb / 1024 < 10 ? 1 : 0)} MB`;
}

/**
 * Próxima versão para o mesmo `file_name` dentro do entregável.
 * Respeita o índice único `(deliverable_id, version_number, file_name)`
 * das linhas ativas.
 */
export function nextEvidenceVersion(items: EvidenceListItem[], fileName: string): number {
  return (
    items
      .filter((item) => item.fileName === fileName)
      .reduce((max, item) => Math.max(max, item.versionNumber), 0) + 1
  );
}

/** Agrupa versões ativas por arquivo, mais recente primeiro. */
export function groupEvidenceVersions(items: EvidenceListItem[]): {
  fileName: string;
  versions: EvidenceListItem[];
}[] {
  const map = new Map<string, EvidenceListItem[]>();
  for (const item of items) {
    const list = map.get(item.fileName) ?? [];
    list.push(item);
    map.set(item.fileName, list);
  }
  return Array.from(map.entries()).map(([fileName, versions]) => ({
    fileName,
    versions: [...versions].sort((a, b) => b.versionNumber - a.versionNumber),
  }));
}

export async function listEvidences(deliverableId: string): Promise<EvidenceListItem[]> {
  const { data, error } = await client()
    .from("evidences")
    .select(SELECT_COLUMNS)
    .eq("deliverable_id", deliverableId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    emitEvent({
      event_name: "backend.request.failure",
      context: { operation: "evidences.list", supabase_error: sanitize(error) },
    });
    throw new Error("Não foi possível carregar as evidências.");
  }

  return ((data ?? []) as EvidenceRow[]).map(mapEvidence);
}

export interface CreateEvidenceInput {
  actionId: string;
  deliverableId: string;
  title: string;
  description?: string | null;
  file: File;
  /** Versões ativas já existentes no entregável (para calcular a próxima). */
  existing?: EvidenceListItem[];
}

/**
 * Upload metadata-first com rollback compensatório (ver
 * `src/lib/evidence-storage.ts` e `docs/evidences-versioning.md`).
 */
export async function createEvidence(input: CreateEvidenceInput) {
  const title = input.title.trim();
  if (title.length < 3) {
    throw new EvidenceStorageError(
      "invalid_filename",
      "Informe um título com ao menos 3 caracteres.",
    );
  }
  validateEvidenceFile(input.file);

  const c = client();
  const organizationId = await fetchCurrentOrganizationId();
  if (!organizationId) {
    throw new Error("Seu perfil não está vinculado a uma organização.");
  }
  const { data: authData } = await c.auth.getUser();
  if (!authData.user) {
    throw new Error("Sessão expirada. Entre novamente para enviar evidências.");
  }

  const existing = input.existing ?? (await listEvidences(input.deliverableId));

  return uploadEvidence(
    {
      organizationId,
      actionId: input.actionId,
      deliverableId: input.deliverableId,
      title,
      description: input.description?.trim() ? input.description.trim() : null,
      versionNumber: nextEvidenceVersion(existing, sanitizeEvidenceFilename(input.file.name)),
      uploadedBy: authData.user.id,
      file: input.file,
    },
    c as unknown as EvidenceSupabaseLike,
  );
}

export { sanitizeEvidenceFilename };

/** Link temporário de download (Storage API, RLS aplicada). */
export async function getEvidenceDownloadUrl(storagePath: string): Promise<string> {
  return createEvidenceSignedUrl(storagePath, 120, client() as unknown as EvidenceSupabaseLike);
}

/** Soft-delete apenas do metadata; o objeto permanece no bucket. */
export async function softDeleteEvidence(evidenceId: string): Promise<void> {
  const { data, error } = await client()
    .from("evidences")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", evidenceId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    emitEvent({
      event_name: "backend.request.failure",
      context: { operation: "evidences.soft_delete", supabase_error: sanitize(error) },
    });
    throw new Error("Não foi possível excluir a evidência.");
  }
}
