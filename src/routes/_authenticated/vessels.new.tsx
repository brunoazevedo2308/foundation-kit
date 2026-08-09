import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";
import { useState } from "react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { EMPTY_VESSEL_FORM, VesselForm } from "@/components/vessel-form";
import { canManageOperationalData } from "@/lib/clients";
import { createVessel, type VesselListItem } from "@/lib/vessels";

export const Route = createFileRoute("/_authenticated/vessels/new")({
  head: () => ({
    meta: [
      { title: "Nova embarcação · DP Suite" },
      { name: "description", content: "Cadastro de uma nova embarcação da frota DP." },
      { property: "og:title", content: "Nova embarcação · DP Suite" },
      { property: "og:description", content: "Cadastro de uma nova embarcação da frota DP." },
    ],
  }),
  beforeLoad: ({ context }) => {
    if (!context.profile || !canManageOperationalData(context.profile.role)) {
      throw redirect({ to: "/vessels" });
    }
  },
  component: NewVesselPage,
});

function NewVesselPage() {
  const [created, setCreated] = useState<VesselListItem | null>(null);
  const [formKey, setFormKey] = useState(0);

  if (created) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Embarcação cadastrada"
          description="A embarcação já está disponível na frota."
        />
        <div
          className="max-w-2xl rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-6"
          role="status"
        >
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" aria-hidden />
            <div>
              <p className="font-medium">{created.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {created.imoNumber ? `IMO ${created.imoNumber}` : "Sem IMO informado"} ·{" "}
                {created.clientName ?? "Sem cliente vinculado"}
              </p>
            </div>
          </div>
          <div className="mt-6 flex gap-2">
            <Button asChild>
              <Link to="/vessels">Voltar para embarcações</Link>
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setCreated(null);
                setFormKey((value) => value + 1);
              }}
            >
              Cadastrar outra
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nova embarcação"
        description="Informe os dados operacionais e o vínculo opcional com um cliente."
      />
      <VesselForm
        key={formKey}
        initialValues={EMPTY_VESSEL_FORM}
        submitLabel="Cadastrar embarcação"
        submittingLabel="Salvando..."
        cancelTo={<Link to="/vessels">Cancelar</Link>}
        onSubmit={async (values) => {
          setCreated(await createVessel(values));
        }}
      />
    </div>
  );
}
