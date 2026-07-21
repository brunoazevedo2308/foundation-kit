import { z } from "zod";

import { supabase } from "./supabase";

/**
 * US-005 — Cadastrar Organization.
 *
 * Este módulo concentra a validação do formulário e a chamada exclusiva à
 * RPC `public.create_organization`. O frontend NUNCA insere diretamente em
 * `public.organizations`: toda a criação passa pela função SECURITY DEFINER,
 * que autoriza apenas `system_admin` ativos e emite os eventos de auditoria.
 */

export const ORG_STATUSES = ["active", "inactive"] as const;
export type OrganizationStatus = (typeof ORG_STATUSES)[number];

export const ORG_LANGUAGES = ["pt-BR", "en-US", "es-ES"] as const;
export const ORG_DATE_FORMATS = ["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"] as const;

/** Zod schema espelhando as validações do backend (US-005). */
export const CreateOrganizationSchema = z.object({
  legalName: z
    .string()
    .trim()
    .min(2, { message: "Informe a razão social." })
    .max(200, { message: "Máximo de 200 caracteres." }),
  displayName: z
    .string()
    .trim()
    .min(2, { message: "Informe o nome de exibição." })
    .max(120, { message: "Máximo de 120 caracteres." }),
  countryCode: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .pipe(z.string().regex(/^[A-Z]{2}$/, { message: "País deve estar em ISO-3166 (2 letras)." })),
  primaryEmail: z
    .string()
    .trim()
    .toLowerCase()
    .email({ message: "E-mail inválido." })
    .max(254, { message: "E-mail muito longo." }),
  status: z.enum(ORG_STATUSES, { errorMap: () => ({ message: "Status inválido." }) }),
  language: z.enum(ORG_LANGUAGES, { errorMap: () => ({ message: "Idioma inválido." }) }),
  timezone: z
    .string()
    .trim()
    .min(1, { message: "Informe o fuso horário." })
    .max(64, { message: "Fuso horário inválido." }),
  dateFormat: z.enum(ORG_DATE_FORMATS, {
    errorMap: () => ({ message: "Formato de data inválido." }),
  }),
});

export type CreateOrganizationInput = z.infer<typeof CreateOrganizationSchema>;

/**
 * Categorias de erro mapeadas para mensagens amigáveis em PT-BR.
 * `denied`     — 42501 (RPC recusou por falta de privilégio).
 * `validation` — 23514/22P02 (constraint/enum).
 * `conflict`   — 23505 ou índice único (legal_name / slug).
 * `unknown`    — qualquer outro erro (rede, indisponibilidade).
 */
export type OrganizationErrorKind = "denied" | "validation" | "conflict" | "unknown";

export class CreateOrganizationError extends Error {
  readonly kind: OrganizationErrorKind;
  constructor(kind: OrganizationErrorKind, message: string) {
    super(message);
    this.kind = kind;
    this.name = "CreateOrganizationError";
  }
}

type PostgrestLikeError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
};

/**
 * Traduz um erro do PostgREST/Supabase em `CreateOrganizationError`.
 * Exportado para testes.
 */
export function mapCreateOrganizationError(err: PostgrestLikeError): CreateOrganizationError {
  const code = err.code ?? "";
  const message = (err.message ?? "").toLowerCase();

  if (code === "42501" || message.includes("system admin")) {
    return new CreateOrganizationError(
      "denied",
      "Somente System Admin ativo pode criar organizações.",
    );
  }
  if (code === "23505" || message.includes("duplicate") || message.includes("unique")) {
    return new CreateOrganizationError(
      "conflict",
      "Já existe uma organização com essa razão social.",
    );
  }
  if (code === "23514" || code === "22P02") {
    return new CreateOrganizationError(
      "validation",
      "Dados inválidos. Revise os campos e tente novamente.",
    );
  }
  return new CreateOrganizationError(
    "unknown",
    "Não foi possível criar a organização agora. Tente novamente em instantes.",
  );
}

/** Executa a RPC oficial. Nunca insere diretamente em `organizations`. */
export async function createOrganization(input: CreateOrganizationInput): Promise<string> {
  if (!supabase) {
    throw new CreateOrganizationError(
      "unknown",
      "Backend indisponível. Contate o administrador do sistema.",
    );
  }
  const parsed = CreateOrganizationSchema.parse(input);
  const { data, error } = await supabase.rpc("create_organization", {
    _legal_name: parsed.legalName,
    _display_name: parsed.displayName,
    _country_code: parsed.countryCode,
    _primary_email: parsed.primaryEmail,
    _status: parsed.status,
    _default_language: parsed.language,
    _timezone: parsed.timezone,
    _date_format: parsed.dateFormat,
  });
  if (error) throw mapCreateOrganizationError(error as PostgrestLikeError);
  if (typeof data !== "string") {
    throw new CreateOrganizationError("unknown", "Resposta inesperada do servidor.");
  }
  return data;
}
