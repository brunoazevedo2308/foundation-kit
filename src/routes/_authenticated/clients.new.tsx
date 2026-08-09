import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";
import { useState } from "react";

import { ClientForm, EMPTY_CLIENT_FORM } from "@/components/client-form";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { canManageOperationalData, createClient, type ClientListItem } from "@/lib/clients";

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

function NewClientPage() {
  const [created, setCreated] = useState<ClientListItem | null>(null);
  const [formKey, setFormKey] = useState(0);

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
                setFormKey((value) => value + 1);
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
      <ClientForm
        key={formKey}
        initialValues={EMPTY_CLIENT_FORM}
        submitLabel="Cadastrar cliente"
        submittingLabel="Salvando..."
        cancelTo={<Link to="/clients">Cancelar</Link>}
        onSubmit={async (values) => {
          setCreated(await createClient(values));
        }}
      />
    </div>
  );
}
