import { z } from "zod";

import { emitEvent, sanitize } from "./observability";
import { supabase } from "./supabase";

function client() {
  if (!supabase) throw new Error("Backend indisponível. Contate o administrador do sistema.");
  return supabase;
}

export const OrganizationSettingsSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome de exibição.").max(120),
  legalName: z.string().trim().min(2, "Informe a razão social.").max(200),
  primaryEmail: z.string().trim().toLowerCase().email("Informe um e-mail válido.").max(254),
  defaultLanguage: z.enum(["pt-BR", "en-US", "es-ES"]),
  timezone: z.string().trim().min(1, "Informe o fuso horário.").max(64),
  dateFormat: z.enum(["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"]),
});

export type OrganizationSettingsInput = z.infer<typeof OrganizationSettingsSchema>;

export type OrganizationSettings = OrganizationSettingsInput & {
  id: string;
  countryCode: string;
  status: "active" | "inactive";
};

export async function getOrganizationSettings(): Promise<OrganizationSettings> {
  const { data, error } = await client()
    .from("organizations")
    .select(
      "id, name, legal_name, primary_email, country_code, status, default_language, timezone, date_format",
    )
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !data) {
    emitEvent({
      event_name: "backend.request.failure",
      context: { operation: "organizations.settings.read", supabase_error: sanitize(error) },
    });
    throw new Error("Não foi possível carregar as configurações da organização.");
  }

  return {
    id: data.id,
    name: data.name,
    legalName: data.legal_name,
    primaryEmail: data.primary_email,
    countryCode: data.country_code,
    status: data.status,
    defaultLanguage: data.default_language as OrganizationSettingsInput["defaultLanguage"],
    timezone: data.timezone,
    dateFormat: data.date_format as OrganizationSettingsInput["dateFormat"],
  };
}

export async function updateOrganizationSettings(
  input: OrganizationSettingsInput,
): Promise<OrganizationSettings> {
  const parsed = OrganizationSettingsSchema.parse(input);
  const { data, error } = await client().rpc("admin_update_organization_settings", {
    _name: parsed.name,
    _legal_name: parsed.legalName,
    _primary_email: parsed.primaryEmail,
    _default_language: parsed.defaultLanguage,
    _timezone: parsed.timezone,
    _date_format: parsed.dateFormat,
  });

  if (error || !data) {
    emitEvent({
      event_name: "backend.request.failure",
      context: { operation: "organizations.settings.update", supabase_error: sanitize(error) },
    });
    throw new Error(
      error?.code === "42501"
        ? "Você não tem permissão para alterar a organização."
        : "Não foi possível salvar as configurações da organização.",
    );
  }

  return {
    id: data.id,
    name: data.name,
    legalName: data.legal_name,
    primaryEmail: data.primary_email,
    countryCode: data.country_code,
    status: data.status,
    defaultLanguage: data.default_language as OrganizationSettingsInput["defaultLanguage"],
    timezone: data.timezone,
    dateFormat: data.date_format as OrganizationSettingsInput["dateFormat"],
  };
}
