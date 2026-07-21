import { z } from "zod";

import type { AppRole, ProfileStatus } from "./auth";
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

export const InviteUserSchema = z.object({
  fullName: z.string().trim().min(2, "Informe o nome completo.").max(120),
  email: z.string().trim().toLowerCase().email("Informe um e-mail válido.").max(254),
  organizationId: z.string().uuid("Selecione uma organização."),
  role: z.enum(["system_admin", "organization_admin", "member"]),
});

export type InviteUserInput = z.infer<typeof InviteUserSchema>;

export type UserListItem = {
  id: string;
  fullName: string | null;
  organizationId: string | null;
  organizationName: string | null;
  role: AppRole;
  status: ProfileStatus;
  createdAt: string;
  lastLoginAt: string | null;
};

export type AssignableOrganization = {
  id: string;
  name: string;
};

export type InvitedUser = {
  id: string;
  fullName: string;
  organizationId: string;
  organizationName: string;
  role: AppRole;
};

type InviteFunctionBody = {
  ok?: boolean;
  code?: string;
  correlation_id?: string;
  user?: {
    id: string;
    full_name: string;
    organization_id: string;
    organization_name: string;
    role: AppRole;
  };
};

export class InviteUserError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly correlationId?: string,
  ) {
    super(message);
    this.name = "InviteUserError";
  }
}

export async function listUsers(): Promise<UserListItem[]> {
  const { data, error } = await client()
    .from("profiles")
    .select("id, full_name, organization_id, role, status, created_at, last_login_at, organizations(name)")
    .is("deleted_at", null)
    .order("full_name", { ascending: true });

  if (error) {
    emitEvent({
      event_name: "backend.request.failure",
      context: { operation: "profiles.list", supabase_error: sanitize(error) },
    });
    throw new Error("Não foi possível carregar os usuários.");
  }

  return (data ?? []).map((row) => {
    const organization = Array.isArray(row.organizations)
      ? row.organizations[0]
      : row.organizations;
    return {
      id: row.id,
      fullName: row.full_name,
      organizationId: row.organization_id,
      organizationName: organization?.name ?? null,
      role: row.role as AppRole,
      status: row.status as ProfileStatus,
      createdAt: row.created_at,
      lastLoginAt: row.last_login_at,
    };
  });
}

export async function listAssignableOrganizations(
  callerRole: AppRole,
): Promise<AssignableOrganization[]> {
  const c = client();

  if (callerRole === "system_admin") {
    const { data, error } = await c
      .from("organizations")
      .select("id, name")
      .eq("status", "active")
      .is("deleted_at", null)
      .order("name");
    if (error) throw new Error("Não foi possível carregar as organizações.");
    return data ?? [];
  }

  const { data: authData } = await c.auth.getUser();
  if (!authData.user) return [];

  const { data, error } = await c
    .from("profiles")
    .select("organization_id, organizations(id, name)")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (error || !data?.organization_id) return [];

  const organization = Array.isArray(data.organizations)
    ? data.organizations[0]
    : data.organizations;
  return organization ? [{ id: organization.id, name: organization.name }] : [];
}

export async function inviteUser(input: InviteUserInput): Promise<InvitedUser> {
  const parsed = InviteUserSchema.parse(input);
  emitEvent({
    event_name: "users.invite.ui_attempt",
    organization_id: parsed.organizationId,
    context: { role: parsed.role },
  });

  const { data, error } = await client().functions.invoke<InviteFunctionBody>("invite-user", {
    body: {
      full_name: parsed.fullName,
      email: parsed.email,
      organization_id: parsed.organizationId,
      role: parsed.role,
    },
  });

  if (error || !data?.ok || !data.user) {
    const code = data?.code ?? "temporary_error";
    const messages: Record<string, string> = {
      validation_error: "Revise os dados informados.",
      forbidden: "Você não tem permissão para convidar este usuário.",
      email_conflict: "Já existe uma conta cadastrada com este e-mail.",
      temporary_error: "Não foi possível enviar o convite agora. Tente novamente.",
    };
    emitEvent({
      event_name: "users.invite.ui_failure",
      organization_id: parsed.organizationId,
      context: { code, correlation_id: data?.correlation_id, error: sanitize(error) },
    });
    throw new InviteUserError(
      messages[code] ?? messages.temporary_error,
      code,
      data?.correlation_id,
    );
  }

  emitEvent({
    event_name: "users.invite.ui_success",
    organization_id: parsed.organizationId,
    user_id: data.user.id,
    context: { role: data.user.role, correlation_id: data.correlation_id },
  });

  return {
    id: data.user.id,
    fullName: data.user.full_name,
    organizationId: data.user.organization_id,
    organizationName: data.user.organization_name,
    role: data.user.role,
  };
}
