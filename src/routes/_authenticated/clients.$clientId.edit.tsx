import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { ClientForm } from "@/components/client-form";
import { PageHeader } from "@/components/page-header";
import {
  canManageOperationalData,
  getClient,
  toClientFormInput,
  updateClient,
  type ClientFormInput,
  type ClientListItem,
} from "@/lib/clients";

/**
 * US-004 (3º ciclo) — edição de cliente.
 *
 * Gate de UI aqui; reforço no banco pela policy `clients_update_same_org`
 * (migration 20260807125500_harden_clients_vessels_admin_writes.sql).
 */
export const Route = createFileRoute("/_authenticated/clients/$clientId/edit")({
  head: () => ({
    meta: [
      { title: "Editar cliente · DP Suite" },
      { name: "description", content: "Edição de um cliente da organização." },
      { name: "robots", content: "noindex" },
    ],
  }),
  beforeLoad: ({ context }) => {
    if (!context.profile || !canManageOperationalData(context.profile.role)) {
      throw redirect({ to: "/clients" });
    }
  },
  component: EditClientPage,
});

function EditClientPage() {
  const { clientId } = Route.useParams();
  const navigate = useNavigate();
  const [item, setItem] = useState<ClientListItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getClient(clientId)
      .then((row) => {
        if (active) setItem(row);
      })
      .catch((err) => {
        if (active)
          setError(err instanceof Error ? err.message : "Não foi possível carregar o cliente.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [clientId]);

  const initialValues: ClientFormInput | null = useMemo(
    () => (item ? toClientFormInput(item) : null),
    [item],
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Editar cliente" description="Atualize os dados cadastrais e o contato." />

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
          Carregando cliente...
        </div>
      ) : !item || !initialValues ? (
        !error ? (
          <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            Cliente não encontrado ou pertence a outra organização.
          </div>
        ) : null
      ) : (
        <ClientForm
          initialValues={initialValues}
          submitLabel="Salvar alterações"
          submittingLabel="Salvando..."
          cancelTo={<Link to="/clients">Cancelar</Link>}
          onSubmit={async (values) => {
            await updateClient(clientId, values);
            await navigate({ to: "/clients" });
          }}
        />
      )}
    </div>
  );
}
