import { createFileRoute, Link, redirect, useRouter } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CreateOrganizationError,
  CreateOrganizationSchema,
  ORG_DATE_FORMATS,
  ORG_LANGUAGES,
  ORG_STATUSES,
  createOrganization,
  type CreateOrganizationInput,
  type CreatedOrganization,
} from "@/lib/organizations";

/**
 * US-005 — Cadastrar Organization.
 *
 * Form PT-BR que chama `public.create_organization` via RPC. Estados:
 *   • loading           — botão desabilitado, spinner textual.
 *   • sucesso           — retorna para `/organizations` (Next US expande listagem).
 *   • acesso negado     — mensagem 42501 (sem detalhes do backend).
 *   • validação         — mensagem por campo (Zod) ou geral (23514/22P02).
 *   • conflito          — razão social já cadastrada (23505).
 *   • erro temporário   — mensagem genérica de retry.
 * Nunca insere direto em `organizations`.
 */
export const Route = createFileRoute("/_authenticated/organizations/new")({
  head: () => ({
    meta: [
      { title: "Nova Organization · DP Suite" },
      { name: "description", content: "Cadastro de nova organização no DP Suite." },
    ],
  }),
  beforeLoad: ({ context }) => {
    if (context.profile?.role !== "system_admin") {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: NewOrganizationPage,
});

type FieldErrors = Partial<Record<keyof CreateOrganizationInput, string>>;

const DEFAULTS: CreateOrganizationInput = {
  legalName: "",
  displayName: "",
  countryCode: "BR",
  primaryEmail: "",
  status: "active",
  language: "pt-BR",
  timezone: "America/Sao_Paulo",
  dateFormat: "DD/MM/YYYY",
};

function NewOrganizationPage() {
  const router = useRouter();
  const [values, setValues] = useState<CreateOrganizationInput>(DEFAULTS);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState<CreatedOrganization | null>(null);

  function update<K extends keyof CreateOrganizationInput>(
    key: K,
    value: CreateOrganizationInput[K],
  ) {
    setValues((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function resetForNewEntry() {
    setValues(DEFAULTS);
    setErrors({});
    setFormError(null);
    setCreated(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setErrors({});

    const parsed = CreateOrganizationSchema.safeParse(values);
    if (!parsed.success) {
      const fieldErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof CreateOrganizationInput | undefined;
        if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setLoading(true);
    try {
      const row = await createOrganization(parsed.data);
      setCreated(row);
    } catch (err) {
      if (err instanceof CreateOrganizationError) {
        setFormError(err.message);
      } else {
        setFormError("Não foi possível criar a organização agora. Tente novamente.");
      }
    } finally {
      setLoading(false);
    }
  }

  if (created) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Organization criada"
          description="Os dados abaixo confirmam o cadastro realizado."
        />
        <div
          role="status"
          aria-live="polite"
          className="max-w-2xl rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-6"
        >
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
                Organization criada com sucesso.
              </p>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs uppercase tracking-widest text-muted-foreground">Nome</dt>
                  <dd className="mt-0.5 break-words font-medium">{created.name}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-widest text-muted-foreground">ID</dt>
                  <dd className="mt-0.5 break-all font-mono text-xs">{created.id}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-widest text-muted-foreground">Slug</dt>
                  <dd className="mt-0.5 break-all font-mono text-xs">{created.slug}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-widest text-muted-foreground">
                    Status
                  </dt>
                  <dd className="mt-0.5">{created.status}</dd>
                </div>
              </dl>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <Button asChild>
              <Link to="/organizations">Voltar para a lista</Link>
            </Button>
            <Button variant="outline" onClick={resetForNewEntry}>
              Criar outra
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nova Organization"
        description="Cadastre uma nova organização cliente do DP Suite."
      />

      <form onSubmit={onSubmit} className="max-w-2xl space-y-6" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Razão social" htmlFor="legalName" error={errors.legalName}>
            <Input
              id="legalName"
              value={values.legalName}
              onChange={(e) => update("legalName", e.target.value)}
              maxLength={200}
              required
            />
          </Field>
          <Field label="Nome de exibição" htmlFor="displayName" error={errors.displayName}>
            <Input
              id="displayName"
              value={values.displayName}
              onChange={(e) => update("displayName", e.target.value)}
              maxLength={120}
              required
            />
          </Field>
          <Field label="País (ISO-2)" htmlFor="countryCode" error={errors.countryCode}>
            <Input
              id="countryCode"
              value={values.countryCode}
              onChange={(e) => update("countryCode", e.target.value.toUpperCase())}
              maxLength={2}
              required
            />
          </Field>
          <Field label="E-mail principal" htmlFor="primaryEmail" error={errors.primaryEmail}>
            <Input
              id="primaryEmail"
              type="email"
              value={values.primaryEmail}
              onChange={(e) => update("primaryEmail", e.target.value)}
              maxLength={254}
              required
            />
          </Field>

          <Field label="Status" htmlFor="status" error={errors.status}>
            <Select
              value={values.status}
              onValueChange={(v) => update("status", v as CreateOrganizationInput["status"])}
            >
              <SelectTrigger id="status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ORG_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s === "active" ? "Ativa" : "Inativa"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Idioma padrão" htmlFor="language" error={errors.language}>
            <Select
              value={values.language}
              onValueChange={(v) => update("language", v as CreateOrganizationInput["language"])}
            >
              <SelectTrigger id="language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ORG_LANGUAGES.map((l) => (
                  <SelectItem key={l} value={l}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Fuso horário" htmlFor="timezone" error={errors.timezone}>
            <Input
              id="timezone"
              value={values.timezone}
              onChange={(e) => update("timezone", e.target.value)}
              maxLength={64}
              required
            />
          </Field>
          <Field label="Formato de data" htmlFor="dateFormat" error={errors.dateFormat}>
            <Select
              value={values.dateFormat}
              onValueChange={(v) =>
                update("dateFormat", v as CreateOrganizationInput["dateFormat"])
              }
            >
              <SelectTrigger id="dateFormat">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ORG_DATE_FORMATS.map((f) => (
                  <SelectItem key={f} value={f}>
                    {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        {formError && (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {formError}
          </p>
        )}

        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => router.navigate({ to: "/organizations" })}
            disabled={loading}
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? "Salvando..." : "Criar Organization"}
          </Button>
        </div>
      </form>
    </div>
  );
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
