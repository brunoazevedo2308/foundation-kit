import { createFileRoute, Link } from "@tanstack/react-router";
import { ClipboardList, FileCheck2, FileSearch, FileText, FlaskConical, Ship } from "lucide-react";
import { useEffect, useState } from "react";

import { DocumentFilesSection } from "@/components/document-files-section";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { canManageOperationalData } from "@/lib/clients";
import { getDocumentCompany, type DocumentCompany } from "@/lib/document-companies";
import { listVessels, type VesselListItem } from "@/lib/vessels";

export const Route = createFileRoute("/_authenticated/documents/$companyId")({
  head: () => ({
    meta: [{ title: "Empresa · Documentos · Atino DP Suite" }],
  }),
  component: DocumentCompanyPage,
});

const DOCUMENT_AREAS = [
  {
    value: "procedures",
    label: "Procedimento DP",
    description: "Procedimentos operacionais e instruções relacionadas às operações DP.",
    icon: ClipboardList,
  },
  {
    value: "forms",
    label: "Formulários DP",
    description: "Formulários, checklists e registros padronizados de DP.",
    icon: FileCheck2,
  },
  {
    value: "trials-fmea",
    label: "Trials/FMEA",
    description: "Documentação de trials, FMEA e evidências técnicas associadas.",
    icon: FlaskConical,
  },
  {
    value: "documents",
    label: "Documentos DP",
    description: "Demais documentos técnicos e administrativos relacionados ao DP.",
    icon: FileText,
  },
  {
    value: "audits",
    label: "Auditoria DP",
    description: "Relatórios, evidências, planos e registros relacionados a auditorias DP.",
    icon: FileSearch,
  },
] as const;

function DocumentCompanyPage() {
  const { companyId } = Route.useParams();
  const { profile } = Route.useRouteContext();
  const canManage = canManageOperationalData(profile.role);
  const [company, setCompany] = useState<DocumentCompany | null>(null);
  const [vessels, setVessels] = useState<VesselListItem[]>([]);
  const [selectedVesselId, setSelectedVesselId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([getDocumentCompany(companyId), listVessels()])
      .then(([row, vesselRows]) => {
        if (!active) return;
        setCompany(row);
        const activeVessels = vesselRows.filter((vessel) => vessel.status === "active");
        setVessels(activeVessels);
        setSelectedVesselId((current) =>
          activeVessels.some((vessel) => vessel.id === current)
            ? current
            : (activeVessels[0]?.id ?? ""),
        );
        if (!row) setError("Empresa não encontrada.");
      })
      .catch((caught) => {
        if (active) {
          setError(
            caught instanceof Error ? caught.message : "Não foi possível carregar a empresa.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [companyId]);

  if (loading) {
    return (
      <div className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
        Carregando biblioteca documental...
      </div>
    );
  }

  if (!company || error) {
    return (
      <div className="space-y-4">
        <p role="alert" className="text-sm text-destructive">
          {error ?? "Empresa não encontrada."}
        </p>
        <Button asChild variant="outline">
          <Link to="/documents">Voltar para documentos</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={company.name}
        description="Biblioteca documental da empresa organizada por embarcação e categoria DP."
      />

      <section className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Ship className="size-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <Label htmlFor="document-vessel">Embarcação</Label>
            <p className="mt-1 text-sm text-muted-foreground">
              Selecione o barco para acessar sua biblioteca documental.
            </p>
            {vessels.length > 0 ? (
              <Select value={selectedVesselId} onValueChange={setSelectedVesselId}>
                <SelectTrigger id="document-vessel" className="mt-3 w-full sm:max-w-md">
                  <SelectValue placeholder="Selecione a embarcação" />
                </SelectTrigger>
                <SelectContent>
                  {vessels.map((vessel) => (
                    <SelectItem key={vessel.id} value={vessel.id}>
                      {vessel.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="mt-3 rounded-lg border border-dashed border-border p-4">
                <p className="text-sm text-muted-foreground">
                  Cadastre uma embarcação ativa para organizar os documentos desta empresa.
                </p>
                {canManage ? (
                  <Button asChild variant="outline" size="sm" className="mt-3">
                    <Link to="/vessels/new">Cadastrar embarcação</Link>
                  </Button>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </section>

      {selectedVesselId ? (
        <Tabs key={selectedVesselId} defaultValue={DOCUMENT_AREAS[0].value} className="space-y-4">
          <div className="overflow-x-auto pb-1">
            <TabsList className="h-auto min-w-max justify-start">
              {DOCUMENT_AREAS.map((area) => (
                <TabsTrigger key={area.value} value={area.value} className="min-h-10">
                  {area.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {DOCUMENT_AREAS.map((area) => {
            const Icon = area.icon;
            return (
              <TabsContent key={area.value} value={area.value}>
                <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
                  <div className="flex items-start gap-4">
                    <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                      <Icon className="size-5" aria-hidden />
                    </div>
                    <div>
                      <h2 className="font-semibold text-foreground">{area.label}</h2>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        {area.description}
                      </p>
                    </div>
                  </div>
                  <DocumentFilesSection
                    companyId={company.id}
                    vesselId={selectedVesselId}
                    category={area.value}
                    canManage={canManage}
                  />
                </section>
              </TabsContent>
            );
          })}
        </Tabs>
      ) : null}
    </div>
  );
}
