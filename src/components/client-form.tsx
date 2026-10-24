import { Plus, Trash2 } from "lucide-react";
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
  contacts: [{ email: "", phone: "", responsibleArea: "" }],
};

type FieldErrors = Record<string, string | undefined>;

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

  function updateContact(index: number, key: "email" | "phone" | "responsibleArea", value: string) {
    setValues((current) => ({
      ...current,
      contacts: current.contacts.map((contact, contactIndex) =>
        contactIndex === index ? { ...contact, [key]: value } : contact,
      ),
    }));
    const errorKey = `contacts.${index}.${key}`;
    if (errors[errorKey]) {
      setErrors((current) => ({ ...current, [errorKey]: undefined }));
    }
  }

  function addContact() {
    setValues((current) => ({
      ...current,
      contacts: [...current.contacts, { email: "", phone: "", responsibleArea: "" }],
    }));
  }

  function removeContact(index: number) {
    setValues((current) => {
      const contacts = current.contacts.filter((_, contactIndex) => contactIndex !== index);
      return {
        ...current,
        contacts: contacts.length > 0 ? contacts : [{ email: "", phone: "", responsibleArea: "" }],
      };
    });
    setErrors({});
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErrors({});
    setFormError(null);

    const parsed = ClientFormSchema.safeParse(values);
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join(".");
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
    <form onSubmit={handleSubmit} className="max-w-4xl space-y-6" noValidate>
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
      </div>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-foreground">Contatos</legend>
        <div className="space-y-4">
          {values.contacts.map((contact, index) => (
            <div
              key={contact.id ?? `new-contact-${index}`}
              className="rounded-lg border border-border bg-card p-4"
            >
              <div className="grid gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-start">
                <Field
                  label="E-mail"
                  htmlFor={`contact-email-${index}`}
                  error={errors[`contacts.${index}.email`]}
                >
                  <Input
                    id={`contact-email-${index}`}
                    type="email"
                    value={contact.email ?? ""}
                    onChange={(event) => updateContact(index, "email", event.target.value)}
                    maxLength={254}
                    autoComplete="email"
                  />
                </Field>
                <Field
                  label="Contato telefônico"
                  htmlFor={`contact-phone-${index}`}
                  error={errors[`contacts.${index}.phone`]}
                >
                  <Input
                    id={`contact-phone-${index}`}
                    value={contact.phone ?? ""}
                    onChange={(event) => updateContact(index, "phone", event.target.value)}
                    maxLength={40}
                    autoComplete="tel"
                  />
                </Field>
                <Field
                  label="Setor/Área responsável"
                  htmlFor={`contact-area-${index}`}
                  error={errors[`contacts.${index}.responsibleArea`]}
                >
                  <Input
                    id={`contact-area-${index}`}
                    value={contact.responsibleArea ?? ""}
                    onChange={(event) =>
                      updateContact(index, "responsibleArea", event.target.value)
                    }
                    maxLength={120}
                  />
                </Field>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="mt-7"
                  aria-label={`Remover contato ${index + 1}`}
                  onClick={() => removeContact(index)}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </div>
            </div>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={addContact}
          disabled={values.contacts.length >= 20}
        >
          <Plus className="mr-2 size-4" aria-hidden />
          Adicionar outro e-mail
        </Button>
        {errors.contacts ? (
          <p className="text-xs text-destructive" role="alert">
            {errors.contacts}
          </p>
        ) : null}
      </fieldset>

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
