import { z } from "zod";

import { fetchCurrentOrganizationId } from "./clients";
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

export const DocumentCompanyFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Informe o nome da empresa.")
    .max(160, "Máximo de 160 caracteres."),
});

export type DocumentCompanyFormInput = z.input<typeof DocumentCompanyFormSchema>;

export type DocumentCompany = {
  id: string;
  name: string;
  createdAt: string;
};

type DocumentCompanyRow = {
  id: string;
  name: string;
  created_at: string;
};

export function mapDocumentCompany(row: DocumentCompanyRow): DocumentCompany {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
  };
}

export async function listDocumentCompanies(): Promise<DocumentCompany[]> {
  const { data, error } = await client()
    .from("document_companies")
    .select("id, name, created_at")
    .is("deleted_at", null)
    .order("name", { ascending: true });

  if (error) {
    emitEvent({
      event_name: "backend.request.failure",
      context: { operation: "document_companies.list", supabase_error: sanitize(error) },
    });
    throw new Error("Não foi possível carregar as empresas de documentos.");
  }

  return ((data ?? []) as DocumentCompanyRow[]).map(mapDocumentCompany);
}

export async function getDocumentCompany(companyId: string): Promise<DocumentCompany | null> {
  const { data, error } = await client()
    .from("document_companies")
    .select("id, name, created_at")
    .eq("id", companyId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    emitEvent({
      event_name: "backend.request.failure",
      context: { operation: "document_companies.get", supabase_error: sanitize(error) },
    });
    throw new Error("Não foi possível carregar a empresa.");
  }

  return data ? mapDocumentCompany(data as DocumentCompanyRow) : null;
}

export async function createDocumentCompany(
  input: DocumentCompanyFormInput,
): Promise<DocumentCompany> {
  const parsed = DocumentCompanyFormSchema.parse(input);
  const organizationId = await fetchCurrentOrganizationId();
  if (!organizationId) {
    throw new Error("Seu perfil não está vinculado a uma organização.");
  }

  const { data, error } = await client()
    .from("document_companies")
    .insert({ organization_id: organizationId, name: parsed.name })
    .select("id, name, created_at")
    .single();

  if (error || !data) {
    emitEvent({
      event_name: "backend.request.failure",
      organization_id: organizationId,
      context: { operation: "document_companies.create", supabase_error: sanitize(error) },
    });
    if (error?.code === "23505") {
      throw new Error("Já existe uma empresa com este nome.");
    }
    throw new Error("Não foi possível cadastrar a empresa agora.");
  }

  return mapDocumentCompany(data as DocumentCompanyRow);
}
