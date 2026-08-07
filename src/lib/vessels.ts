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
  status: VesselStatus;
  clientId: string | null;
  clientName: string | null;
  createdAt: string;
};

const SELECT_COLUMNS =
  "id, name, imo_number, vessel_type, dp_class, status, client_id, created_at, clients(name)";

type VesselRow = {
  id: string;
  name: string;
  imo_number: string | null;
  vessel_type: string | null;
  dp_class: string | null;
  status: string;
  client_id: string | null;
  created_at: string;
  clients?: { name: string } | { name: string }[] | null;
};

function mapVessel(row: VesselRow): VesselListItem {
  const related = Array.isArray(row.clients) ? row.clients[0] : row.clients;
  return {
    id: row.id,
    name: row.name,
    imoNumber: row.imo_number,
    vesselType: row.vessel_type,
    dpClass: row.dp_class,
    status: row.status as VesselStatus,
    clientId: row.client_id,
    clientName: related?.name ?? null,
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
