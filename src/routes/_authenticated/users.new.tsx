import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AppRole } from "@/lib/auth";
import {
  InviteUserError,
  InviteUserSchema,
  inviteUser,
  listAssignableOrganizations,
  type AssignableOrganization,
  type InviteUserInput,
  type InvitedUser,
} from "@/lib/users";

export const Route = createFileRoute("/_authenticated/users/new")({
  head: () => ({
    meta: [
      { title: "Convidar usuário · DP Suite" },
      { name: "description", content: "Cadastro e convite de usuário para o DP Suite." },
    ],
  }),
  beforeLoad: ({ context }) => {
    if (!context.profile || context.profile.role === "member") {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: NewUserPage,
});

type FieldErrors = Partial<Record<keyof InviteUserInput, string>>;

const EMPTY_VALUES: InviteUserInput = {
  fullName: "",
  email: "",
  organizationId: "",
  role: "member",
};

function NewUserPage() {
  const { profile } = Route.useRouteContext();
  const callerRole = profile.role;
  const [values, setValues] = useState<InviteUserInput>(EMPTY_VALUES);
  const [organizations, setOrganizations] = useState<AssignableOrganization[]>([]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loadingOrganizations, setLoadingOrganizations] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<InvitedUser | null>(null);

  const availableRoles = useMemo<AppRole[]>(
    () =>
      callerRole === "system_admin"
        ? ["system_admin", "organization_admin", "member"]
        : ["organization_admin", "member"],
    [callerRole],
  );

  useEffect(() => {
    let active = true;
    listAssignableOrganizations(callerRole)
      .then((rows) => {
        if (!active) return;
        setOrganizations(rows);
        if (rows.length === 1) {
          setValues((current) => ({ ...current, organizationId: rows[0].id }));
        }
      })
      .catch(() => {
        if (active) setFormError("Não foi possível carregar as organizações disponíveis.");
      })
      .finally(() => {
        if (active) setLoadingOrganizations(false);
      });
    return () => {
      active = false;
    };
  }, [callerRole]);

  function update<K extends keyof InviteUserInput>(key: K, value: InviteUserInput[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    if (errors[key]) setErrors((current) => ({ ...current, [key]: undefined }));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setErrors({});
    setFormError(null);

    const parsed = InviteUserSchema.safeParse(values);
    if (!parsed.success) {
      const nextErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof InviteUserInput | undefined;
        if (key && !nextErrors[key]) nextErrors[key] = issue.message;
      }
      setErrors(nextErrors);
      return;
    }

    setSubmitting(true);
    try {
      setCreated(await inviteUser(parsed.data));
    } catch (error) {
      const message =
        error instanceof InviteUserError || error instanceof Error
          ? error.message
          : "Não foi possível enviar o convite agora.";
      setFormError(message);
    } finally {
      setSubmitting(false);
    }
  }

  if (created) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Convite enviado"
          description="O usuário receberá um e-mail para concluir o acesso."
        />
        <div
          className="max-w-2xl rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-6"
          role="status"
        >
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" aria-hidden />
            <div>
              <p className="font-medium">{created.fullName}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {created.organizationName} · {roleLabel(created.role)}
              </p>
            </div>
          </div>
          <div className="mt-6 flex gap-2">
            <Button asChild>
              <Link to="/users">Voltar para usuários</Link>
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setCreated(null);
                setValues({
                  ...EMPTY_VALUES,
                  organizationId: organizations.length === 1 ? organizations[0].id : "",
                });
              }}
            >
              Convidar outro
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Convidar usuário"
        description="Cadastre o perfil e envie o convite de acesso por e-mail."
      />

      <form onSubmit={onSubmit} className="max-w-2xl space-y-6" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome completo" htmlFor="fullName" error={errors.fullName}>
            <Input
              id="fullName"
              value={values.fullName}
              onChange={(event) => update("fullName", event.target.value)}
              maxLength={120}
              autoComplete="name"
              required
            />
          </Field>

          <Field label="E-mail" htmlFor="email" error={errors.email}>
            <Input
              id="email"
              type="email"
              value={values.email}
              onChange={(event) => update("email", event.target.value)}
              maxLength={254}
              autoComplete="email"
              required
            />
          </Field>

          <Field label="Organização" htmlFor="organizationId" error={errors.organizationId}>
            {!loadingOrganizations && organizations.length === 1 ? (
              <Input id="organizationId" value={organizations[0].name} readOnly disabled />
            ) : (
              <Select
                value={values.organizationId}
                onValueChange={(value) => update("organizationId", value)}
                disabled={loadingOrganizations}
              >
                <SelectTrigger id="organizationId">
                  <SelectValue placeholder={loadingOrganizations ? "Carregando..." : "Selecione"} />
                </SelectTrigger>

                <SelectContent>
                  {organizations.map((organization) => (
                    <SelectItem key={organization.id} value={organization.id}>
                      {organization.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>


          <Field label="Papel" htmlFor="role" error={errors.role}>
            <Select value={values.role} onValueChange={(value) => update("role", value as AppRole)}>
              <SelectTrigger id="role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableRoles.map((role) => (
                  <SelectItem key={role} value={role}>
                    {roleLabel(role)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        {formError ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {formError}
          </p>
        ) : null}

        {!loadingOrganizations && organizations.length === 0 ? (
          <p
            role="status"
            className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground"
          >
            Nenhuma organização disponível para atribuição. Vincule seu perfil a uma organização
            (ou crie uma) antes de convidar usuários.
          </p>
        ) : null}



        <div className="flex justify-end gap-2">
          <Button asChild variant="ghost">
            <Link to="/users">Cancelar</Link>
          </Button>
          <Button
            type="submit"
            disabled={submitting || loadingOrganizations || organizations.length === 0}
          >
            {submitting ? "Enviando..." : "Enviar convite"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function roleLabel(role: AppRole) {
  if (role === "system_admin") return "Administrador do sistema";
  if (role === "organization_admin") return "Administrador da organização";
  return "Membro";
}

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
