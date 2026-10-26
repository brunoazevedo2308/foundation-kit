import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";
import { useState } from "react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { EMPTY_VESSEL_FORM, VesselForm } from "@/components/vessel-form";
import { canManageOperationalData } from "@/lib/clients";
import {
  createVessel,
  replaceVesselKeyDpPersonnel,
  softDeleteVessel,
  type VesselListItem,
} from "@/lib/vessels";

type NewVesselSearch = {
  companyName?: string;
  documentCompanyId?: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/_authenticated/vessels/new")({
  validateSearch: (search: Record<string, unknown>): NewVesselSearch => ({
    companyName:
      typeof search.companyName === "string" ? search.companyName.trim().slice(0, 160) : undefined,
    documentCompanyId:
      typeof search.documentCompanyId === "string" && UUID_PATTERN.test(search.documentCompanyId)
        ? search.documentCompanyId
        : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Nova embarcação · Atino DP Suite" },
      { name: "description", content: "Cadastro de uma nova embarcação da frota DP." },
      { property: "og:title", content: "Nova embarcação · Atino DP Suite" },
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
  const { companyName, documentCompanyId } = Route.useSearch();
  const [created, setCreated] = useState<VesselListItem | null>(null);
  const [formKey, setFormKey] = useState(0);
  const initialValues = { ...EMPTY_VESSEL_FORM, companyName: companyName ?? "" };
  const returnLink = documentCompanyId ? (
    <Link to="/documents/$companyId" params={{ companyId: documentCompanyId }}>
      Voltar para a empresa
    </Link>
  ) : (
    <Link to="/vessels">Voltar para embarcações</Link>
  );

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
                {created.clientName ?? "Sem cliente vinculado"}
              </p>
            </div>
          </div>
          <div className="mt-6 flex gap-2">
            <Button asChild>{returnLink}</Button>
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
        initialValues={initialValues}
        submitLabel="Cadastrar embarcação"
        submittingLabel="Salvando..."
        cancelTo={
          documentCompanyId ? (
            <Link to="/documents/$companyId" params={{ companyId: documentCompanyId }}>
              Cancelar
            </Link>
          ) : (
            <Link to="/vessels">Cancelar</Link>
          )
        }
        onSubmit={async (values, extras) => {
          const vessel = await createVessel(values);
          try {
            if (extras.keyDpPersonnelUserIds.length > 0) {
              await replaceVesselKeyDpPersonnel(vessel.id, extras.keyDpPersonnelUserIds);
            }
          } catch (error) {
            await softDeleteVessel(vessel.id).catch(() => undefined);
            throw error;
          }
          setCreated(vessel);
        }}
      />
    </div>
  );
}
