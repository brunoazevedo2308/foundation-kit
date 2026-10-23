import { z } from "zod";

import { fetchCurrentOrganizationId } from "./clients";
import { emitEvent, sanitize } from "./observability";
import { supabase } from "./supabase";

/**
 * US-004 — Embarcações.
 *
 * Reaproveita o schema existente (`public.vessels`). O vínculo opcional a
 * um cliente é validado no banco pelo trigger `enforce_vessel_org_integrity`,
 * que garante que cliente e embarcação pertençam à mesma organização.
 */

function client() {
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.",
    );
  }
  return supabase;
}

export const VESSEL_STATUSES = ["active", "inactive"] as const;
export type VesselStatus = (typeof VESSEL_STATUSES)[number];

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .default(null);

export const VesselFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Informe o nome da embarcação.")
    .max(120, "Máximo de 120 caracteres."),
  imoNumber: z
    .string()
    .trim()
    .max(20, "Máximo de 20 caracteres.")
    .refine((value) => value === "" || /^[0-9]{7}$/.test(value), {
      message: "O número IMO deve conter exatamente 7 dígitos.",
    })
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .default(null),
  vesselType: optionalText(80, "Máximo de 80 caracteres."),
  dpClass: optionalText(20, "Máximo de 20 caracteres."),
  contractManagement: optionalText(160, "Máximo de 160 caracteres."),
  contractManager: optionalText(120, "Máximo de 120 caracteres."),
  status: z.enum(VESSEL_STATUSES),
  clientId: z
    .string()
    .trim()
    .refine((value) => value === "" || z.string().uuid().safeParse(value).success, {
      message: "Selecione um cliente válido.",
    })
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .default(null),
});

export type VesselFormInput = z.input<typeof VesselFormSchema>;
export type VesselFormValues = z.output<typeof VesselFormSchema>;

export type VesselListItem = {
  id: string;
  name: string;
  imoNumber: string | null;
  vesselType: string | null;
  dpClass: string | null;
  contractManagement: string | null;
  contractManager: string | null;
  status: VesselStatus;
  clientId: string | null;
  clientName: string | null;
  keyDpPersonnel: VesselKeyDpPerson[];
  createdAt: string;
};

export type VesselKeyDpPerson = {
  userId: string;
  fullName: string | null;
};

const SELECT_COLUMNS =
  "id, name, imo_number, vessel_type, dp_class, contract_management, contract_manager, status, client_id, created_at, clients(name), user_vessels(profile_id, profiles!user_vessels_profile_id_fkey(full_name))";

type VesselRow = {
  id: string;
  name: string;
  imo_number: string | null;
  vessel_type: string | null;
  dp_class: string | null;
  contract_management: string | null;
  contract_manager: string | null;
  status: string;
  client_id: string | null;
  created_at: string;
  clients?: { name: string } | { name: string }[] | null;
  user_vessels?:
    | {
        profile_id: string;
        profiles?: { full_name: string | null } | { full_name: string | null }[] | null;
      }[]
    | null;
};

function mapVessel(row: VesselRow): VesselListItem {
  const related = Array.isArray(row.clients) ? row.clients[0] : row.clients;
  const keyDpPersonnel = (row.user_vessels ?? [])
    .map((assignment) => {
      const profile = Array.isArray(assignment.profiles)
        ? assignment.profiles[0]
        : assignment.profiles;
      return { userId: assignment.profile_id, fullName: profile?.full_name ?? null };
    })
    .sort((left, right) =>
      (left.fullName ?? left.userId).localeCompare(right.fullName ?? right.userId, "pt-BR"),
    );
  return {
    id: row.id,
    name: row.name,
    imoNumber: row.imo_number,
    vesselType: row.vessel_type,
    dpClass: row.dp_class,
    contractManagement: row.contract_management,
    contractManager: row.contract_manager,
    status: row.status as VesselStatus,
    clientId: row.client_id,
    clientName: related?.name ?? null,
    keyDpPersonnel,
    createdAt: row.created_at,
  };
}

export async function listVessels(): Promise<VesselListItem[]> {
  const { data, error } = await client()
    .from("vessels")
    .select(SELECT_COLUMNS)
    .is("deleted_at", null)
    .order("name", { ascending: true });

  if (error) {
    emitEvent({
      event_name: "backend.request.failure",
      context: { operation: "vessels.list", supabase_error: sanitize(error) },
    });
    throw new Error("Não foi possível carregar as embarcações.");
  }

  return ((data ?? []) as VesselRow[]).map(mapVessel);
}

export async function createVessel(input: VesselFormInput): Promise<VesselListItem> {
  const parsed = VesselFormSchema.parse(input);
  const organizationId = await fetchCurrentOrganizationId();
  if (!organizationId) {
    throw new Error("Seu perfil não está vinculado a uma organização.");
  }

  const { data, error } = await client()
    .from("vessels")
    .insert({
      organization_id: organizationId,
      client_id: parsed.clientId,
      name: parsed.name,
      imo_number: parsed.imoNumber,
      vessel_type: parsed.vesselType,
      dp_class: parsed.dpClass,
      contract_management: parsed.contractManagement,
      contract_manager: parsed.contractManager,
      status: parsed.status,
    })
    .select(SELECT_COLUMNS)
    .single();

  if (error || !data) {
    emitEvent({
      event_name: "backend.request.failure",
      organization_id: organizationId,
      context: { operation: "vessels.create", supabase_error: sanitize(error) },
    });
    if (error?.code === "23505") {
      throw new Error("Já existe uma embarcação ativa com este nome ou número IMO.");
    }
    throw new Error("Não foi possível cadastrar a embarcação agora. Tente novamente.");
  }

  return mapVessel(data as VesselRow);
}

/** Converte uma embarcação carregada do banco em valores de formulário. */
export function toVesselFormInput(item: VesselListItem): VesselFormInput {
  return {
    name: item.name,
    imoNumber: item.imoNumber ?? "",
    vesselType: item.vesselType ?? "",
    dpClass: item.dpClass ?? "",
    contractManagement: item.contractManagement ?? "",
    contractManager: item.contractManager ?? "",
    status: item.status,
    clientId: item.clientId ?? "",
  };
}

/**
 * Substitui a equipe Key DP Personel da embarcação. A tabela de associação
 * possui RLS, integridade de tenant e auditoria; somente administradores da
 * organização podem inserir/remover vínculos.
 */
export async function replaceVesselKeyDpPersonnel(
  vesselId: string,
  requestedUserIds: string[],
): Promise<void> {
  const desired = [...new Set(requestedUserIds.filter(Boolean))];
  const [{ data: assignments, error: listError }, organizationId, userResult] = await Promise.all([
    client().from("user_vessels").select("profile_id").eq("vessel_id", vesselId),
    fetchCurrentOrganizationId(),
    client().auth.getUser(),
  ]);

  if (listError || !organizationId || userResult.error || !userResult.data.user) {
    emitEvent({
      event_name: "backend.request.failure",
      organization_id: organizationId ?? undefined,
      context: {
        operation: "vessels.key_dp_personnel.load_context",
        supabase_error: sanitize(listError ?? userResult.error),
      },
    });
    throw new Error("Não foi possível atualizar o Key DP Personel.");
  }

  const currentIds = new Set((assignments ?? []).map((item) => item.profile_id));
  const desiredIds = new Set(desired);
  const removed = [...currentIds].filter((userId) => !desiredIds.has(userId));
  const added = desired.filter((userId) => !currentIds.has(userId));

  if (removed.length > 0) {
    const { error } = await client()
      .from("user_vessels")
      .delete()
      .eq("vessel_id", vesselId)
      .in("profile_id", removed);
    if (error) {
      emitEvent({
        event_name: "backend.request.failure",
        organization_id: organizationId,
        context: {
          operation: "vessels.key_dp_personnel.remove",
          supabase_error: sanitize(error),
        },
      });
      throw new Error("Não foi possível remover tripulantes do Key DP Personel.");
    }
  }

  if (added.length > 0) {
    const { error } = await client()
      .from("user_vessels")
      .insert(
        added.map((profileId) => ({
          organization_id: organizationId,
          vessel_id: vesselId,
          profile_id: profileId,
          assigned_by: userResult.data.user.id,
        })),
      );
    if (error) {
      emitEvent({
        event_name: "backend.request.failure",
        organization_id: organizationId,
        context: {
          operation: "vessels.key_dp_personnel.add",
          supabase_error: sanitize(error),
        },
      });
      throw new Error("Não foi possível adicionar tripulantes ao Key DP Personel.");
    }
  }
}

export async function getVessel(vesselId: string): Promise<VesselListItem | null> {
  const { data, error } = await client()
    .from("vessels")
    .select(SELECT_COLUMNS)
    .eq("id", vesselId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    emitEvent({
      event_name: "backend.request.failure",
      context: { operation: "vessels.get", supabase_error: sanitize(error) },
    });
    throw new Error("Não foi possível carregar a embarcação.");
  }

  return data ? mapVessel(data as VesselRow) : null;
}

export async function updateVessel(
  vesselId: string,
  input: VesselFormInput,
): Promise<VesselListItem> {
  const parsed = VesselFormSchema.parse(input);

  const { data, error } = await client()
    .from("vessels")
    .update({
      client_id: parsed.clientId,
      name: parsed.name,
      imo_number: parsed.imoNumber,
      vessel_type: parsed.vesselType,
      dp_class: parsed.dpClass,
      contract_management: parsed.contractManagement,
      contract_manager: parsed.contractManager,
      status: parsed.status,
    })
    .eq("id", vesselId)
    .is("deleted_at", null)
    .select(SELECT_COLUMNS)
    .single();

  if (error || !data) {
    emitEvent({
      event_name: "backend.request.failure",
      context: { operation: "vessels.update", supabase_error: sanitize(error) },
    });
    if (error?.code === "23505") {
      throw new Error("Já existe uma embarcação ativa com este nome ou número IMO.");
    }
    throw new Error("Não foi possível salvar as alterações da embarcação.");
  }

  return mapVessel(data as VesselRow);
}

/**
 * Soft-delete via UPDATE em `deleted_at` (DELETE é bloqueado pela RLS).
 */
export async function softDeleteVessel(vesselId: string): Promise<void> {
  const { data, error } = await client()
    .from("vessels")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", vesselId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    emitEvent({
      event_name: "backend.request.failure",
      context: { operation: "vessels.soft_delete", supabase_error: sanitize(error) },
    });
    throw new Error("Não foi possível excluir a embarcação.");
  }
}
