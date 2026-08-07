import { createFileRoute, Link } from "@tanstack/react-router";
import { Building2, Plus } from "lucide-react";
import { useEffect, useState } from "react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { canManageOperationalData, listClients, type ClientListItem } from "@/lib/clients";

export const Route = createFileRoute("/_authenticated/clients/")({
  head: () => ({
    meta: [
      { title: "Clientes · DP Suite" },
      { name: "description", content: "Cadastro de clientes da organização." },
      { property: "og:title", content: "Clientes · DP Suite" },
      { property: "og:description", content: "Cadastro de clientes da organização." },
    ],
  }),
  component: ClientsPage,
});

function ClientsPage() {
  const { profile } = Route.useRouteContext();
  const canManage = canManageOperationalData(profile.role);
  const [clients, setClients] = useState<ClientListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listClients()
      .then((rows) => {
        if (active) setClients(rows);
      })
      .catch((err) => {
        if (active)
          setError(err instanceof Error ? err.message : "Não foi possível carregar os clientes.");
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
        title="Clientes"
        description="Clientes cujas operações DP são governadas por esta organização."
        actions={
          canManage ? (
            <Button asChild>
              <Link to="/clients/new">
                <Plus className="mr-2 h-4 w-4" />
                Novo cliente
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
          Carregando clientes...
        </div>
      ) : clients.length === 0 && !error ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <Building2 className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="mt-3 text-sm font-medium">Nenhum cliente cadastrado.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {canManage
              ? "Cadastre o primeiro cliente para começar."
              : "Solicite ao administrador da organização o cadastro dos clientes."}
          </p>
        </div>
      ) : clients.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Telefone</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell>{item.code ?? "—"}</TableCell>
                  <TableCell>{item.contactName ?? "—"}</TableCell>
                  <TableCell>{item.contactEmail ?? "—"}</TableCell>
                  <TableCell>{item.contactPhone ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </div>
  );
}
