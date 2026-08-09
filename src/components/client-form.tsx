import { useState, type FormEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ClientFormSchema, type ClientFormInput } from "@/lib/clients";

/**
 * US-004 (3º ciclo) — formulário compartilhado de Clientes.
 * Usado na criação (`/clients/new`) e na edição (`/clients/$clientId/edit`).
 */

export const EMPTY_CLIENT_FORM: ClientFormInput = {
  name: "",
  code: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
};

type FieldErrors = Partial<Record<keyof ClientFormInput, string>>;

interface ClientFormProps {
  initialValues: ClientFormInput;
  submitLabel: string;
  submittingLabel: string;
  cancelTo: ReactNode;
  onSubmit: (values: ClientFormInput) => Promise<void>;
}

export function ClientForm({
  initialValues,
  submitLabel,
  submittingLabel,
  cancelTo,
  onSubmit,
}: ClientFormProps) {
  const [values, setValues] = useState<ClientFormInput>(initialValues);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update<K extends keyof ClientFormInput>(key: K, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
    if (errors[key]) setErrors((current) => ({ ...current, [key]: undefined }));
  }

  async function handleSubmit(event: FormEvent) {
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
      await onSubmit(parsed.data);
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Não foi possível salvar o cliente agora.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6" noValidate>
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
          {cancelTo}
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? submittingLabel : submitLabel}
        </Button>
      </div>
    </form>
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
