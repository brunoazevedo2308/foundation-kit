import { z } from "zod";

import { emitEvent, sanitize } from "./observability";
import { supabase } from "./supabase";

/**
 * US-004 — Clientes.
 *
 * Leitura e escrita são feitas diretamente nas tabelas com RLS ativa
 * (`clients_select_same_org` / `clients_insert_same_org`), sempre com a
 * chave publishable. Nenhuma service_role é usada no frontend.
 */

function client() {
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.",
    );
  }
  return supabase;
}

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .default(null);

export const ClientFormSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do cliente.").max(120, "Máximo de 120 caracteres."),
  code: optionalText(40, "Máximo de 40 caracteres."),
  contactName: optionalText(120, "Máximo de 120 caracteres."),
  contactEmail: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, "Máximo de 254 caracteres.")
    .refine((value) => value === "" || z.string().email().safeParse(value).success, {
      message: "Informe um e-mail válido.",
    })
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .default(null),
  contactPhone: optionalText(40, "Máximo de 40 caracteres."),
});

export type ClientFormInput = z.input<typeof ClientFormSchema>;
export type ClientFormValues = z.output<typeof ClientFormSchema>;

export type ClientListItem = {
  id: string;
  name: string;
  code: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  createdAt: string;
};

/** Papéis autorizados a cadastrar dados operacionais. */
export function canManageOperationalData(role: string): boolean {
  return role === "system_admin" || role === "organization_admin";
}

/**
 * Organização do usuário autenticado. Usada para preencher
 * `organization_id` nas inserções — o valor NUNCA vem do formulário.
 */
export async function fetchCurrentOrganizationId(): Promise<string | null> {
  const c = client();
  const { data: authData } = await c.auth.getUser();
  if (!authData.user) return null;
  const { data, error } = await c
    .from("profiles")
    .select("organization_id")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (error) return null;
  return data?.organization_id ?? null;
}

export async function listClients(): Promise<ClientListItem[]> {
  const { data, error } = await client()
    .from("clients")
    .select("id, name, code, contact_name, contact_email, contact_phone, created_at")
    .is("deleted_at", null)
    .order("name", { ascending: true });

  if (error) {
    emitEvent({
      event_name: "backend.request.failure",
      context: { operation: "clients.list", supabase_error: sanitize(error) },
    });
    throw new Error("Não foi possível carregar os clientes.");
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    code: row.code,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    createdAt: row.created_at,
  }));
}

export async function createClient(input: ClientFormInput): Promise<ClientListItem> {
  const parsed = ClientFormSchema.parse(input);
  const organizationId = await fetchCurrentOrganizationId();
  if (!organizationId) {
    throw new Error("Seu perfil não está vinculado a uma organização.");
  }

  const { data, error } = await client()
    .from("clients")
    .insert({
      organization_id: organizationId,
      name: parsed.name,
      code: parsed.code,
      contact_name: parsed.contactName,
      contact_email: parsed.contactEmail,
      contact_phone: parsed.contactPhone,
    })
    .select("id, name, code, contact_name, contact_email, contact_phone, created_at")
    .single();

  if (error || !data) {
    emitEvent({
      event_name: "backend.request.failure",
      organization_id: organizationId,
      context: { operation: "clients.create", supabase_error: sanitize(error) },
    });
    if (error?.code === "23505") {
      throw new Error("Já existe um cliente ativo com este nome ou código.");
    }
    throw new Error("Não foi possível cadastrar o cliente agora. Tente novamente.");
  }

  return {
    id: data.id,
    name: data.name,
    code: data.code,
    contactName: data.contact_name,
    contactEmail: data.contact_email,
    contactPhone: data.contact_phone,
    createdAt: data.created_at,
  };
}
