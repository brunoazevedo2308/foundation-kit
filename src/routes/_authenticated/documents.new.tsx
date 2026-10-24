import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { canManageOperationalData } from "@/lib/clients";
import { createDocumentCompany, DocumentCompanyFormSchema } from "@/lib/document-companies";

export const Route = createFileRoute("/_authenticated/documents/new")({
  head: () => ({
    meta: [{ title: "Inserir empresa · Documentos · Atino DP Suite" }],
  }),
  beforeLoad: ({ context }) => {
    if (!context.profile || !canManageOperationalData(context.profile.role)) {
      throw redirect({ to: "/documents" });
    }
  },
  component: NewDocumentCompanyPage,
});

function NewDocumentCompanyPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldError(null);
    setFormError(null);

    const parsed = DocumentCompanyFormSchema.safeParse({ name });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? "Informe o nome da empresa.");
      return;
    }

    setSubmitting(true);
    try {
      const company = await createDocumentCompany(parsed.data);
      await navigate({ to: "/documents/$companyId", params: { companyId: company.id } });
    } catch (caught) {
      setFormError(
        caught instanceof Error ? caught.message : "Não foi possível cadastrar a empresa.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inserir empresa"
        description="Crie uma biblioteca documental com cinco áreas DP para esta empresa."
      />

      <form onSubmit={handleSubmit} className="max-w-xl space-y-6" noValidate>
        <div className="space-y-2">
          <Label htmlFor="document-company-name">Nome da empresa</Label>
          <Input
            id="document-company-name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (fieldError) setFieldError(null);
            }}
            maxLength={160}
            autoComplete="organization"
            aria-invalid={Boolean(fieldError)}
            aria-describedby={fieldError ? "document-company-name-error" : undefined}
            autoFocus
          />
          {fieldError ? (
            <p id="document-company-name-error" className="text-sm text-destructive">
              {fieldError}
            </p>
          ) : null}
        </div>

        {formError ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            {formError}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={submitting}>
            {submitting ? "Inserindo..." : "Inserir empresa"}
          </Button>
          <Button asChild type="button" variant="outline">
            <Link to="/documents">Cancelar</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
