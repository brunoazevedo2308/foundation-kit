import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus, Ship } from "lucide-react";
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
import { canManageOperationalData } from "@/lib/clients";
import { listVessels, type VesselListItem } from "@/lib/vessels";

export const Route = createFileRoute("/_authenticated/vessels/")({
  head: () => ({
    meta: [
      { title: "Embarcações · DP Suite" },
      { name: "description", content: "Frota DP governada pela organização." },
      { property: "og:title", content: "Embarcações · DP Suite" },
      { property: "og:description", content: "Frota DP governada pela organização." },
    ],
  }),
  component: VesselsPage,
});

const STATUS_LABELS: Record<string, string> = {
  active: "Ativa",
  inactive: "Inativa",
};

function VesselsPage() {
  const { profile } = Route.useRouteContext();
  const canManage = canManageOperationalData(profile.role);
  const [vessels, setVessels] = useState<VesselListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listVessels()
      .then((rows) => {
        if (active) setVessels(rows);
      })
      .catch((err) => {
        if (active)
          setError(
            err instanceof Error ? err.message : "Não foi possível carregar as embarcações.",
          );
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
        title="Embarcações"
        description="Frota DP vinculada aos clientes da organização."
        actions={
          canManage ? (
            <Button asChild>
              <Link to="/vessels/new">
                <Plus className="mr-2 h-4 w-4" />
                Nova embarcação
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
          Carregando embarcações...
        </div>
      ) : vessels.length === 0 && !error ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <Ship className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="mt-3 text-sm font-medium">Nenhuma embarcação cadastrada.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {canManage
              ? "Cadastre a primeira embarcação da frota."
              : "Solicite ao administrador da organização o cadastro da frota."}
          </p>
        </div>
      ) : vessels.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>IMO</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Classe DP</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vessels.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell>{item.imoNumber ?? "—"}</TableCell>
                  <TableCell>{item.vesselType ?? "—"}</TableCell>
                  <TableCell>{item.dpClass ?? "—"}</TableCell>
                  <TableCell>{item.clientName ?? "Sem vínculo"}</TableCell>
                  <TableCell>
                    <Badge variant={item.status === "active" ? "default" : "secondary"}>
                      {STATUS_LABELS[item.status] ?? item.status}
                    </Badge>
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
