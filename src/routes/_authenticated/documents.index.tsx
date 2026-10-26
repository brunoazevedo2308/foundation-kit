import { createFileRoute, Link } from "@tanstack/react-router";
import { Building2, ChevronRight, FolderOpen, Plus } from "lucide-react";
import { useEffect, useState } from "react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { canManageOperationalData } from "@/lib/clients";
import { listDocumentCompanies, type DocumentCompany } from "@/lib/document-companies";

export const Route = createFileRoute("/_authenticated/documents/")({
  head: () => ({
    meta: [
      { title: "Documentos · Atino DP Suite" },
      {
        name: "description",
        content: "Biblioteca de documentos organizada por empresa e categoria DP.",
      },
    ],
  }),
  component: DocumentsPage,
});

function DocumentsPage() {
  const { profile } = Route.useRouteContext();
  const canManage = canManageOperationalData(profile.role);
  const [companies, setCompanies] = useState<DocumentCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listDocumentCompanies()
      .then((rows) => {
        if (active) setCompanies(rows);
      })
      .catch((caught) => {
        if (active) {
          setError(
            caught instanceof Error ? caught.message : "Não foi possível carregar as empresas.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Documentos"
        description="Organize os documentos operacionais DP separadamente para cada empresa."
        actions={
          canManage ? (
            <Button asChild>
              <Link to="/documents/new">
                <Plus className="mr-2 h-4 w-4" />
                Inserir empresa
              </Link>
            </Button>
          ) : null
        }
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
          Carregando empresas...
        </div>
      ) : companies.length === 0 && !error ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <FolderOpen className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="mt-3 text-sm font-medium">Nenhuma empresa inserida.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {canManage
              ? "Insira a primeira empresa para abrir sua biblioteca documental."
              : "A biblioteca estará disponível quando uma empresa for inserida."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {companies.map((company) => (
            <Link
              key={company.id}
              to="/documents/$companyId"
              params={{ companyId: company.id }}
              className="group flex min-h-32 items-start gap-4 rounded-xl border border-border bg-card p-5 shadow-sm transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <Building2 className="size-5" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-semibold text-foreground">{company.name}</h2>
                <p className="mt-1 text-sm text-muted-foreground">5 áreas documentais</p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
                  Abrir documentos
                  <ChevronRight
                    className="size-4 transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
