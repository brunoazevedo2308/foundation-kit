import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { PageHeader } from "@/components/page-header";
import { VesselForm } from "@/components/vessel-form";
import { canManageOperationalData } from "@/lib/clients";
import {
  getVessel,
  toVesselFormInput,
  updateVessel,
  type VesselFormInput,
  type VesselListItem,
} from "@/lib/vessels";

/**
 * US-004 (3º ciclo) — edição de embarcação.
 *
 * Gate de UI aqui; reforço no banco pela policy `vessels_update_same_org`
 * (migration 20260807125500_harden_clients_vessels_admin_writes.sql).
 */
export const Route = createFileRoute("/_authenticated/vessels/$vesselId/edit")({
  head: () => ({
    meta: [
      { title: "Editar embarcação · DP Suite" },
      { name: "description", content: "Edição de uma embarcação da frota DP." },
      { name: "robots", content: "noindex" },
    ],
  }),
  beforeLoad: ({ context }) => {
    if (!context.profile || !canManageOperationalData(context.profile.role)) {
      throw redirect({ to: "/vessels" });
    }
  },
  component: EditVesselPage,
});

function EditVesselPage() {
  const { vesselId } = Route.useParams();
  const navigate = useNavigate();
  const [item, setItem] = useState<VesselListItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getVessel(vesselId)
      .then((row) => {
        if (active) setItem(row);
      })
      .catch((err) => {
        if (active)
          setError(err instanceof Error ? err.message : "Não foi possível carregar a embarcação.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [vesselId]);

  const initialValues: VesselFormInput | null = useMemo(
    () => (item ? toVesselFormInput(item) : null),
    [item],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Editar embarcação"
        description="Atualize dados operacionais, status e vínculo com cliente."
      />

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
          Carregando embarcação...
        </div>
      ) : !item || !initialValues ? (
        !error ? (
          <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            Embarcação não encontrada ou pertence a outra organização.
          </div>
        ) : null
      ) : (
        <VesselForm
          initialValues={initialValues}
          submitLabel="Salvar alterações"
          submittingLabel="Salvando..."
          cancelTo={<Link to="/vessels">Cancelar</Link>}
          onSubmit={async (values) => {
            await updateVessel(vesselId, values);
            await navigate({ to: "/vessels" });
          }}
        />
      )}
    </div>
  );
}
