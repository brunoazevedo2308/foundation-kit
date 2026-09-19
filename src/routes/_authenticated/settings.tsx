import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

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
import {
  getOrganizationSettings,
  OrganizationSettingsSchema,
  updateOrganizationSettings,
  type OrganizationSettingsInput,
} from "@/lib/organization-settings";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Configurações · DP Suite" },
      { name: "description", content: "Configurações da conta e da organização." },
    ],
  }),
  component: SettingsPage,
});

type FieldErrors = Partial<Record<keyof OrganizationSettingsInput, string>>;

function SettingsPage() {
  const { profile } = Route.useRouteContext();
  const canManage = profile.role !== "member";
  const [values, setValues] = useState<OrganizationSettingsInput | null>(null);
  const [countryCode, setCountryCode] = useState("");
  const [status, setStatus] = useState<"active" | "inactive">("active");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getOrganizationSettings()
      .then((organization) => {
        if (!active) return;
        setValues({
          name: organization.name,
          legalName: organization.legalName,
          primaryEmail: organization.primaryEmail,
          defaultLanguage: organization.defaultLanguage,
          timezone: organization.timezone,
          dateFormat: organization.dateFormat,
        });
        setCountryCode(organization.countryCode);
        setStatus(organization.status);
      })
      .catch((err) => {
        if (active)
          setError(err instanceof Error ? err.message : "Não foi possível carregar os dados.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function update<K extends keyof OrganizationSettingsInput>(
    key: K,
    value: OrganizationSettingsInput[K],
  ) {
    setValues((current) => (current ? { ...current, [key]: value } : current));
    setMessage(null);
    if (errors[key]) setErrors((current) => ({ ...current, [key]: undefined }));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!values || !canManage) return;
    setErrors({});
    setError(null);
    setMessage(null);
    const parsed = OrganizationSettingsSchema.safeParse(values);
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof OrganizationSettingsInput | undefined;
        if (key && !next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return;
    }
    setSaving(true);
    try {
      const saved = await updateOrganizationSettings(parsed.data);
      setValues({
        name: saved.name,
        legalName: saved.legalName,
        primaryEmail: saved.primaryEmail,
        defaultLanguage: saved.defaultLanguage,
        timezone: saved.timezone,
        dateFormat: saved.dateFormat,
      });
      setMessage("Configurações salvas com sucesso.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar as configurações.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configurações"
        description="Dados e preferências operacionais da sua organização."
      />

      {loading ? (
        <div className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
          Carregando configurações...
        </div>
      ) : values ? (
        <form onSubmit={onSubmit} className="max-w-3xl space-y-6" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome de exibição" htmlFor="name" error={errors.name}>
              <Input
                id="name"
                value={values.name}
                onChange={(event) => update("name", event.target.value)}
                disabled={!canManage}
              />
            </Field>
            <Field label="Razão social" htmlFor="legalName" error={errors.legalName}>
              <Input
                id="legalName"
                value={values.legalName}
                onChange={(event) => update("legalName", event.target.value)}
                disabled={!canManage}
              />
            </Field>
            <Field label="E-mail administrativo" htmlFor="primaryEmail" error={errors.primaryEmail}>
              <Input
                id="primaryEmail"
                type="email"
                value={values.primaryEmail}
                onChange={(event) => update("primaryEmail", event.target.value)}
                disabled={!canManage}
              />
            </Field>
            <Field label="País" htmlFor="countryCode">
              <Input id="countryCode" value={countryCode} disabled readOnly />
            </Field>
            <Field label="Idioma padrão" htmlFor="defaultLanguage" error={errors.defaultLanguage}>
              <Select
                value={values.defaultLanguage}
                onValueChange={(value) =>
                  update("defaultLanguage", value as OrganizationSettingsInput["defaultLanguage"])
                }
                disabled={!canManage}
              >
                <SelectTrigger id="defaultLanguage">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pt-BR">pt-BR</SelectItem>
                  <SelectItem value="en-US">en-US</SelectItem>
                  <SelectItem value="es-ES">es-ES</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Fuso horário" htmlFor="timezone" error={errors.timezone}>
              <Input
                id="timezone"
                value={values.timezone}
                onChange={(event) => update("timezone", event.target.value)}
                disabled={!canManage}
              />
            </Field>
            <Field label="Formato de data" htmlFor="dateFormat" error={errors.dateFormat}>
              <Select
                value={values.dateFormat}
                onValueChange={(value) =>
                  update("dateFormat", value as OrganizationSettingsInput["dateFormat"])
                }
                disabled={!canManage}
              >
                <SelectTrigger id="dateFormat">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                  <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                  <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Status" htmlFor="status">
              <Input
                id="status"
                value={status === "active" ? "Ativa" : "Inativa"}
                disabled
                readOnly
              />
            </Field>
          </div>

          {message ? (
            <p
              role="status"
              className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300"
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden /> {message}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          {!canManage ? (
            <p className="text-sm text-muted-foreground">
              Somente administradores podem alterar estes dados.
            </p>
          ) : (
            <Button type="submit" disabled={saving}>
              {saving ? "Salvando..." : "Salvar configurações"}
            </Button>
          )}
        </form>
      ) : null}
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
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
