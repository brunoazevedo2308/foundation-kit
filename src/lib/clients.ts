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
  name: z
    .string()
    .trim()
    .min(2, "Informe o nome do cliente.")
    .max(120, "Máximo de 120 caracteres."),
  code: optionalText(40, "Máximo de 40 caracteres."),
  contacts: z
    .array(
      z
        .object({
          id: z.string().uuid().optional(),
          email: z
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
          phone: optionalText(40, "Máximo de 40 caracteres."),
          responsibleArea: optionalText(120, "Máximo de 120 caracteres."),
        })
        .superRefine((contact, context) => {
          if (!contact.email && (contact.phone || contact.responsibleArea)) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["email"],
              message: "Informe o e-mail deste contato.",
            });
          }
        }),
    )
    .max(20, "Cadastre no máximo 20 contatos.")
    .transform((contacts) =>
      contacts.filter((contact) => contact.email || contact.phone || contact.responsibleArea),
    ),
});

export type ClientFormInput = z.input<typeof ClientFormSchema>;
export type ClientFormValues = z.output<typeof ClientFormSchema>;

export type ClientContact = {
  id: string;
  email: string | null;
  phone: string | null;
  responsibleArea: string | null;
};

export type ClientListItem = {
  id: string;
  name: string;
  code: string | null;
  contacts: ClientContact[];
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
    .select(CLIENT_SELECT_COLUMNS)
    .is("deleted_at", null)
    .order("name", { ascending: true });

  if (error) {
    emitEvent({
      event_name: "backend.request.failure",
      context: { operation: "clients.list", supabase_error: sanitize(error) },
    });
    throw new Error("Não foi possível carregar os clientes.");
  }

  return ((data ?? []) as ClientRow[]).map(mapClient);
}

async function insertClientContacts(
  clientId: string,
  organizationId: string,
  contacts: ClientFormValues["contacts"],
): Promise<void> {
  if (contacts.length === 0) return;
  const { error } = await client()
    .from("client_contacts")
    .insert(
      contacts.map((contact, position) => ({
        organization_id: organizationId,
        client_id: clientId,
        email: contact.email,
        phone: contact.phone,
        responsible_area: contact.responsibleArea,
        position,
      })),
    );
  if (error) throw error;
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
    })
    .select("id")
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

  try {
    await insertClientContacts(data.id, organizationId, parsed.contacts);
  } catch (contactError) {
    await softDeleteClient(data.id).catch(() => undefined);
    emitEvent({
      event_name: "backend.request.failure",
      organization_id: organizationId,
      context: { operation: "clients.contacts.create", supabase_error: sanitize(contactError) },
    });
    throw new Error("Não foi possível salvar os contatos do cliente.");
  }

  const created = await getClient(data.id);
  if (!created) throw new Error("O cliente foi cadastrado, mas não pôde ser recarregado.");
  return created;
}

const CLIENT_SELECT_COLUMNS =
  "id, name, code, created_at, client_contacts(id, email, phone, responsible_area, position)";

type ClientRow = {
  id: string;
  name: string;
  code: string | null;
  created_at: string;
  client_contacts?:
    | {
        id: string;
        email: string | null;
        phone: string | null;
        responsible_area: string | null;
        position: number;
      }[]
    | null;
};

function mapClient(row: ClientRow): ClientListItem {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    contacts: [...(row.client_contacts ?? [])]
      .sort((left, right) => left.position - right.position)
      .map((contact) => ({
        id: contact.id,
        email: contact.email,
        phone: contact.phone,
        responsibleArea: contact.responsible_area,
      })),
    createdAt: row.created_at,
  };
}

/** Converte um cliente carregado do banco em valores de formulário. */
export function toClientFormInput(item: ClientListItem): ClientFormInput {
  return {
    name: item.name,
    code: item.code ?? "",
    contacts:
      item.contacts.length > 0
        ? item.contacts.map((contact) => ({
            id: contact.id,
            email: contact.email ?? "",
            phone: contact.phone ?? "",
            responsibleArea: contact.responsibleArea ?? "",
          }))
        : [{ email: "", phone: "", responsibleArea: "" }],
  };
}

async function syncClientContacts(
  clientId: string,
  contacts: ClientFormValues["contacts"],
): Promise<void> {
  const c = client();
  const [organizationId, currentResult] = await Promise.all([
    fetchCurrentOrganizationId(),
    c.from("client_contacts").select("id").eq("client_id", clientId),
  ]);
  if (!organizationId || currentResult.error) {
    throw currentResult.error ?? new Error("Organização não encontrada.");
  }

  const currentIds = new Set((currentResult.data ?? []).map((contact) => contact.id));
  for (const contact of contacts) {
    if (contact.id && !currentIds.has(contact.id)) {
      throw new Error("Contato inválido para este cliente.");
    }
  }

  const writes = contacts.map((contact, position) => {
    const payload = {
      email: contact.email,
      phone: contact.phone,
      responsible_area: contact.responsibleArea,
      position,
    };
    if (contact.id) {
      return c
        .from("client_contacts")
        .update(payload)
        .eq("id", contact.id)
        .eq("client_id", clientId);
    }
    return c.from("client_contacts").insert({
      ...payload,
      organization_id: organizationId,
      client_id: clientId,
    });
  });

  const results = await Promise.all(writes);
  const writeError = results.find((result) => result.error)?.error;
  if (writeError) throw writeError;

  const desiredIds = new Set(contacts.flatMap((contact) => (contact.id ? [contact.id] : [])));
  const removedIds = [...currentIds].filter((id) => !desiredIds.has(id));
  if (removedIds.length > 0) {
    const { error } = await c
      .from("client_contacts")
      .delete()
      .eq("client_id", clientId)
      .in("id", removedIds);
    if (error) throw error;
  }
}

export async function getClient(clientId: string): Promise<ClientListItem | null> {
  const { data, error } = await client()
    .from("clients")
    .select(CLIENT_SELECT_COLUMNS)
    .eq("id", clientId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    emitEvent({
      event_name: "backend.request.failure",
      context: { operation: "clients.get", supabase_error: sanitize(error) },
    });
    throw new Error("Não foi possível carregar o cliente.");
  }

  return data ? mapClient(data as ClientRow) : null;
}

export async function updateClient(
  clientId: string,
  input: ClientFormInput,
): Promise<ClientListItem> {
  const parsed = ClientFormSchema.parse(input);

  const { data, error } = await client()
    .from("clients")
    .update({
      name: parsed.name,
      code: parsed.code,
    })
    .eq("id", clientId)
    .is("deleted_at", null)
    .select(CLIENT_SELECT_COLUMNS)
    .single();

  if (error || !data) {
    emitEvent({
      event_name: "backend.request.failure",
      context: { operation: "clients.update", supabase_error: sanitize(error) },
    });
    if (error?.code === "23505") {
      throw new Error("Já existe um cliente ativo com este nome ou código.");
    }
    throw new Error("Não foi possível salvar as alterações do cliente.");
  }

  try {
    await syncClientContacts(clientId, parsed.contacts);
  } catch (contactError) {
    emitEvent({
      event_name: "backend.request.failure",
      context: { operation: "clients.contacts.update", supabase_error: sanitize(contactError) },
    });
    throw new Error(
      "Os dados do cliente foram salvos, mas não foi possível atualizar os contatos.",
    );
  }

  return (await getClient(clientId)) ?? mapClient(data as ClientRow);
}

/**
 * Soft-delete: DELETE físico é bloqueado pela RLS; marcamos `deleted_at`
 * via UPDATE, permitido apenas para admins da mesma organização
 * (migration 20260807125500_harden_clients_vessels_admin_writes.sql).
 */
export async function softDeleteClient(clientId: string): Promise<void> {
  const { data, error } = await client()
    .from("clients")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", clientId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    emitEvent({
      event_name: "backend.request.failure",
      context: { operation: "clients.soft_delete", supabase_error: sanitize(error) },
    });
    throw new Error("Não foi possível excluir o cliente.");
  }
}
