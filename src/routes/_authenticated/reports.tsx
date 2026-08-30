import { createFileRoute, Link } from "@tanstack/react-router";
import { Download, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { DashboardFiltersCard } from "@/components/dashboard-filters";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ACTION_CRITICALITY_LABELS,
  ACTION_PRIORITY_LABELS,
  ACTION_STATUS_LABELS,
} from "@/lib/actions";
import {
  applyFilters,
  buildFilterOptions,
  EMPTY_FILTERS,
  fetchDashboardData,
  hasActiveFilters,
  localDateKey,
  type DashboardData,
  type DashboardFilters,
} from "@/lib/dashboard";
import { emitEvent, sanitize } from "@/lib/observability";
import {
  buildReportRows,
  computeReportMetrics,
  formatDateBR,
  pendingDeliverablesFor,
  reportFileName,
  toCsv,
} from "@/lib/reports";

/**
 * US-009 (MVP) — Relatório operacional de Ações com exportação CSV.
 *
 * Nenhuma tabela/view/RPC nova: consome o mesmo carregamento tenant-scoped do
 * dashboard (RLS como fonte da verdade, `deleted_at IS NULL`). A exportação é
 * gerada 100% no navegador, apenas sobre o recorte filtrado.
 */
export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Relatórios · DP Suite" },
      {
        name: "description",
        content: "Relatório operacional de ações com filtros gerenciais e exportação CSV.",
      },
      { property: "og:title", content: "Relatórios · DP Suite" },
      {
        property: "og:description",
        content: "Recorte filtrado de ações, indicadores e exportação CSV em PT-BR.",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: ReportsPage,
});

function MetricCard({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
        <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function ReportsPage() {
  const { profile } = Route.useRouteContext();
  const organizationName = profile.organizationName ?? "Organização não vinculada";

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<DashboardFilters>(EMPTY_FILTERS);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchDashboardData();
      setData(result);
      setError(null);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : "Não foi possível carregar o relatório.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const today = localDateKey();
  const filterOptions = useMemo(() => buildFilterOptions(data?.actions ?? []), [data]);
  const filtered = hasActiveFilters(filters);

  const view = useMemo(() => {
    if (!data) return null;
    const scoped = applyFilters(data, filters, today);
    const rows = buildReportRows(scoped, today);
    return {
      scoped,
      rows,
      metrics: computeReportMetrics(rows),
      pendingDeliverables: pendingDeliverablesFor(rows, scoped),
    };
  }, [data, filters, today]);

  const isEmptyTenant = Boolean(data && data.actions.length === 0);
  const clearFilters = useCallback(() => setFilters(EMPTY_FILTERS), []);

  const exportCsv = useCallback(() => {
    if (!view || view.rows.length === 0) return;
    try {
      const blob = new Blob([toCsv(view.rows)], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = reportFileName(today);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      emitEvent({
        event_name: "report.export.success",
        context: { operation: "reports.csv", rows: view.rows.length, filtered },
      });
    } catch (err) {
      emitEvent({
        event_name: "report.export.failure",
        context: { operation: "reports.csv", error: sanitize(err) },
      });
      setError("Não foi possível gerar o arquivo CSV neste navegador.");
    }
  }, [view, today, filtered]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader
        title="Relatórios"
        description={`Relatório operacional de ações da organização ${organizationName}.`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw
                className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
              Atualizar
            </Button>
            <Button
              size="sm"
              onClick={exportCsv}
              disabled={loading || !view || view.rows.length === 0}
            >
              <Download className="mr-2 h-4 w-4" aria-hidden="true" />
              Exportar CSV
            </Button>
          </div>
        }
      />

      {loading ? (
        <Card>
          <CardContent
            className="py-10 text-center text-sm text-muted-foreground"
            aria-live="polite"
          >
            Carregando relatório...
          </CardContent>
        </Card>
      ) : error ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Não foi possível carregar o relatório</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => void load()}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      ) : isEmptyTenant ? (
        <Card>
          <CardHeader>
            <CardTitle>Nenhuma ação registrada</CardTitle>
            <CardDescription>
              Sua organização ainda não possui ações ativas. Assim que a primeira ação for
              registrada, o relatório e a exportação passam a refletir os dados automaticamente.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/actions">Ir para Ações</Link>
            </Button>
          </CardContent>
        </Card>
      ) : view ? (
        <>
          <DashboardFiltersCard
            filters={filters}
            options={filterOptions}
            onChange={setFilters}
            onClear={clearFilters}
          />

          <section
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5"
            aria-label="Indicadores do recorte"
          >
            <MetricCard
              label="Total no recorte"
              value={view.metrics.total}
              hint="Ações que atendem aos filtros aplicados."
            />
            <MetricCard
              label="Abertas"
              value={view.metrics.open}
              hint="Não concluídas nem canceladas."
            />
            <MetricCard
              label="Vencidas"
              value={view.metrics.overdue}
              hint="Prazo anterior a hoje e ainda em aberto."
            />
            <MetricCard
              label="Concluídas/canceladas"
              value={view.metrics.closed}
              hint="Ações já encerradas no recorte."
            />
            <MetricCard
              label="Críticas"
              value={view.metrics.critical}
              hint="Criticidade alta ou crítica, em aberto."
            />
          </section>

          <p className="text-sm text-muted-foreground" role="status">
            {view.pendingDeliverables} entregáveis pendentes vinculados a estas ações.
            {filtered ? " Recorte filtrado — a exportação reflete exatamente esta lista." : ""}
          </p>

          {view.rows.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Nenhum resultado para estes filtros</CardTitle>
                <CardDescription>
                  Existem ações na organização, mas nenhuma atende à combinação de filtros
                  selecionada. Ajuste os critérios ou limpe os filtros.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" onClick={clearFilters}>
                  Limpar filtros
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Ações do recorte</CardTitle>
                <CardDescription>
                  {view.rows.length} ação(ões) listada(s). Clique no título para abrir o detalhe.
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto p-0 sm:p-0">
                <table className="w-full min-w-[860px] text-sm">
                  <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-4 py-2 font-medium">
                        Ação
                      </th>
                      <th scope="col" className="px-4 py-2 font-medium">
                        Cliente / Embarcação
                      </th>
                      <th scope="col" className="px-4 py-2 font-medium">
                        Responsável
                      </th>
                      <th scope="col" className="px-4 py-2 font-medium">
                        Status
                      </th>
                      <th scope="col" className="px-4 py-2 font-medium">
                        Prazo
                      </th>
                      <th scope="col" className="px-4 py-2 font-medium">
                        Entregáveis
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.rows.map((row) => (
                      <tr key={row.action.id} className="border-b last:border-0 align-top">
                        <td className="px-4 py-3">
                          <Link
                            to="/actions/$actionId"
                            params={{ actionId: row.action.id }}
                            className="font-medium underline-offset-4 hover:underline"
                          >
                            {row.action.title}
                          </Link>
                          <div className="mt-1 flex flex-wrap gap-1">
                            <Badge variant="secondary">
                              {ACTION_PRIORITY_LABELS[row.action.executionPriority]}
                            </Badge>
                            <Badge variant="outline">
                              {ACTION_CRITICALITY_LABELS[row.action.operationalCriticality]}
                            </Badge>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {[row.action.clientName, row.action.vesselName]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {row.action.responsibleName ?? "—"}
                        </td>
                        <td className="px-4 py-3">{ACTION_STATUS_LABELS[row.action.status]}</td>
                        <td className="px-4 py-3">
                          {row.overdue ? (
                            <Badge variant="destructive">
                              Vencida · {formatDateBR(row.action.dueDate)}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">
                              {formatDateBR(row.action.dueDate) || "Sem prazo"}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-muted-foreground">
                          {row.progress.total === 0
                            ? "—"
                            : `${row.progress.completed}/${row.progress.total} (${row.progress.percent}%)`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </>
      ) : null}
    </div>
  );
}
