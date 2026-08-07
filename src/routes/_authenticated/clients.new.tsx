import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ClientFormSchema,
  canManageOperationalData,
  createClient,
  type ClientFormInput,
  type ClientListItem,
} from "@/lib/clients";

export const Route = createFileRoute("/_authenticated/clients/new")({
  head: () => ({
    meta: [
      { title: "Novo cliente · DP Suite" },
      { name: "description", content: "Cadastro de um novo cliente da organização." },
      { property: "og:title", content: "Novo cliente · DP Suite" },
      { property: "og:description", content: "Cadastro de um novo cliente da organização." },
    ],
  }),
  beforeLoad: ({ context }) => {
    if (!context.profile || !canManageOperationalData(context.profile.role)) {
      throw redirect({ to: "/clients" });
    }
  },
  component: NewClientPage,
});

type FieldErrors = Partial<Record<keyof ClientFormInput, string>>;

const EMPTY: ClientFormInput = {
  name: "",
  code: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
};

function NewClientPage() {
  const [values, setValues] = useState<ClientFormInput>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<ClientListItem | null>(null);

  function update<K extends keyof ClientFormInput>(key: K, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
    if (errors[key]) setErrors((current) => ({ ...current, [key]: undefined }));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setErrors({});
    setFormError(null);

    const parsed = ClientFormSchema.safeParse(values);
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof ClientFormInput | undefined;
        if (key && !next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return;
    }

    setSubmitting(true);
    try {
      setCreated(await createClient(parsed.data));
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Não foi possível cadastrar o cliente agora.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (created) {
    return (
      <div className="space-y-6">
        <PageHeader title="Cliente cadastrado" description="O cliente já está disponível." />
        <div
          className="max-w-2xl rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-6"
          role="status"
        >
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" aria-hidden />
            <div>
              <p className="font-medium">{created.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {created.code ? `Código ${created.code}` : "Sem código interno"}
              </p>
            </div>
          </div>
          <div className="mt-6 flex gap-2">
            <Button asChild>
              <Link to="/clients">Voltar para clientes</Link>
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setCreated(null);
                setValues(EMPTY);
              }}
            >
              Cadastrar outro
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Novo cliente"
        description="Informe os dados do cliente e o contato principal."
      />

      <form onSubmit={onSubmit} className="max-w-2xl space-y-6" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome" htmlFor="name" error={errors.name}>
            <Input
              id="name"
              value={values.name}
              onChange={(e) => update("name", e.target.value)}
              maxLength={120}
              required
            />
          </Field>
          <Field label="Código (opcional)" htmlFor="code" error={errors.code}>
            <Input
              id="code"
              value={values.code ?? ""}
              onChange={(e) => update("code", e.target.value)}
              maxLength={40}
            />
          </Field>
          <Field label="Nome do contato" htmlFor="contactName" error={errors.contactName}>
            <Input
              id="contactName"
              value={values.contactName ?? ""}
              onChange={(e) => update("contactName", e.target.value)}
              maxLength={120}
              autoComplete="name"
            />
          </Field>
          <Field label="E-mail do contato" htmlFor="contactEmail" error={errors.contactEmail}>
            <Input
              id="contactEmail"
              type="email"
              value={values.contactEmail ?? ""}
              onChange={(e) => update("contactEmail", e.target.value)}
              maxLength={254}
              autoComplete="email"
            />
          </Field>
          <Field label="Telefone do contato" htmlFor="contactPhone" error={errors.contactPhone}>
            <Input
              id="contactPhone"
              value={values.contactPhone ?? ""}
              onChange={(e) => update("contactPhone", e.target.value)}
              maxLength={40}
              autoComplete="tel"
            />
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

        <div className="flex justify-end gap-2">
          <Button asChild variant="ghost">
            <Link to="/clients">Cancelar</Link>
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Salvando..." : "Cadastrar cliente"}
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
  children: ReactNode;
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
