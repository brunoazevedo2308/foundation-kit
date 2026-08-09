import { createFileRoute, Link } from "@tanstack/react-router";
import { ListChecks, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ACTION_PRIORITY_LABELS,
  ACTION_STATUSES,
  ACTION_STATUS_LABELS,
  isOverdue,
  listActions,
  type ActionListItem,
  type ActionStatus,
} from "@/lib/actions";
import { canManageOperationalData } from "@/lib/clients";

export const Route = createFileRoute("/_authenticated/actions/")({
  head: () => ({
    meta: [
      { title: "Ações · DP Suite" },
      { name: "description", content: "Ações operacionais DP da organização." },
      { property: "og:title", content: "Ações · DP Suite" },
      { property: "og:description", content: "Ações operacionais DP da organização." },
    ],
  }),
  component: ActionsPage,
});

const ALL = "__all__";

function ActionsPage() {
  const { profile } = Route.useRouteContext();
  const canManage = canManageOperationalData(profile.role);
  const [actions, setActions] = useState<ActionListItem[]>([]);
  const [status, setStatus] = useState<string>(ALL);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listActions()
      .then((rows) => {
        if (active) setActions(rows);
      })
      .catch((err) => {
        if (active)
          setError(err instanceof Error ? err.message : "Não foi possível carregar as ações.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const visible = useMemo(
    () => (status === ALL ? actions : actions.filter((item) => item.status === status)),
    [actions, status],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ações"
        description="Planejamento, priorização e acompanhamento das ações operacionais DP."
        actions={
          canManage ? (
            <Button asChild>
              <Link to="/actions/new">
                <Plus className="mr-2 h-4 w-4" />
                Nova ação
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

      {!loading && actions.length > 0 ? (
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Filtrar por status</span>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-56" aria-label="Filtrar por status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos</SelectItem>
              {ACTION_STATUSES.map((value) => (
                <SelectItem key={value} value={value}>
                  {ACTION_STATUS_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
          Carregando ações...
        </div>
      ) : actions.length === 0 && !error ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <ListChecks className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="mt-3 text-sm font-medium">Nenhuma ação cadastrada.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {canManage
              ? "Crie a primeira ação para começar o acompanhamento."
              : "Solicite ao administrador da organização a criação das ações."}
          </p>
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Nenhuma ação com este status.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Título</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Prioridade</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead>Cliente / Embarcação</TableHead>
                <TableHead>Prazo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">
                    <Link
                      to="/actions/$actionId"
                      params={{ actionId: item.id }}
                      className="hover:underline"
                    >
                      {item.title}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{ACTION_STATUS_LABELS[item.status]}</Badge>
                  </TableCell>
                  <TableCell>{ACTION_PRIORITY_LABELS[item.executionPriority]}</TableCell>
                  <TableCell>{item.responsibleName ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {item.clientName ?? "—"} / {item.vesselName ?? "—"}
                  </TableCell>
                  <TableCell>
                    {item.dueDate ? (
                      <span className={isOverdue(item) ? "font-medium text-destructive" : ""}>
                        {item.dueDate}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
