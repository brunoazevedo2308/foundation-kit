import { createFileRoute, Link } from "@tanstack/react-router";
import { Building2, Plus } from "lucide-react";
import { useEffect, useState } from "react";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listOrganizations, type OrganizationListItem } from "@/lib/organizations";

/**
 * US-005 — listagem das Organizations para System Admin.
 * A autorização do módulo é aplicada pela rota pai e novamente pela RPC.
 */
export const Route = createFileRoute("/_authenticated/organizations/")({
  head: () => ({
    meta: [
      { title: "Organizations · DP Suite" },
      { name: "description", content: "Administração de organizações do DP Suite." },
    ],
  }),
  component: OrganizationsIndex,
});

function OrganizationsIndex() {
  const [organizations, setOrganizations] = useState<OrganizationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listOrganizations()
      .then((rows) => {
        if (active) setOrganizations(rows);
      })
      .catch((err) => {
        if (active) {
          setError(
            err instanceof Error ? err.message : "Não foi possível carregar as organizações.",
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
        title="Organizations"
        description="Gestão de organizações do DP Suite."
        actions={
          <Button asChild>
            <Link to="/organizations/new">
              <Plus className="mr-2 h-4 w-4" />
              Nova Organization
            </Link>
          </Button>
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
          Carregando organizações...
        </div>
      ) : organizations.length === 0 && !error ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <Building2 className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="mt-3 text-sm font-medium">Nenhuma organização cadastrada.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Cadastre a primeira organização para começar.
          </p>
        </div>
      ) : organizations.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Razão social</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>País</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Criada em</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {organizations.map((organization) => (
                <TableRow key={organization.id}>
                  <TableCell className="font-medium">{organization.name}</TableCell>
                  <TableCell>{organization.legal_name}</TableCell>
                  <TableCell>{organization.primary_email}</TableCell>
                  <TableCell>{organization.country_code}</TableCell>
                  <TableCell>
                    <Badge variant={organization.status === "active" ? "default" : "secondary"}>
                      {organization.status === "active" ? "Ativa" : "Inativa"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(
                      new Date(organization.created_at),
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </div>
  );
}
