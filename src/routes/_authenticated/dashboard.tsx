import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Flame,
  ListChecks,
  PackageCheck,
  PlayCircle,
  RefreshCw,
} from "lucide-react";
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
  type ActionListItem,
} from "@/lib/actions";
import {
  applyFilters,
  attentionList,
  buildFilterOptions,
  computeKpis,
  distributionByPriority,
  distributionByStatus,
  EMPTY_FILTERS,
  fetchDashboardData,
  hasActiveFilters,
  isActionOverdueLocal,
  localDateKey,
  rankClients,
  rankResponsibles,
  rankVessels,
  summarizeActionDeadlineStatuses,
  type ActionDeadlineSummary,
  type DashboardData,
  type DashboardFilters,
  type RankingEntry,
} from "@/lib/dashboard";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard · Atino DP Suite" },
      { name: "description", content: "Visão geral da governança DP da sua organização." },
      { property: "og:title", content: "Dashboard · Atino DP Suite" },
      {
        property: "og:description",
        content: "KPIs operacionais, distribuições e ações que exigem atenção imediata.",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: DashboardPage,
});

function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: number;
  hint: string;
  icon: typeof ListChecks;
  tone?: "default" | "warning" | "danger";
}) {
  const toneClass =
    tone === "danger"
      ? "text-destructive"
      : tone === "warning"
        ? "text-amber-600 dark:text-amber-400"
        : "text-foreground";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <p className={`text-3xl font-semibold tracking-tight ${toneClass}`}>{value}</p>
        <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

const DEADLINE_STATUS_ITEMS = [
  {
    key: "completed",
    label: "Finalizada",
    description: "Ações concluídas.",
    icon: CheckCircle2,
    className:
      "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100",
    iconClassName: "text-emerald-600 dark:text-emerald-400",
  },
  {
    key: "in_progress",
    label: "Em andamento",
    description: "Mais de 7 dias ou sem prazo.",
    icon: PlayCircle,
    className:
      "border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100",
    iconClassName: "text-sky-600 dark:text-sky-400",
  },
  {
    key: "due_soon",
    label: "Próxima do vencimento",
    description: "Prazo entre hoje e 7 dias.",
    icon: Clock3,
    className:
      "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100",
    iconClassName: "text-amber-600 dark:text-amber-400",
  },
  {
    key: "overdue",
    label: "Atrasada",
    description: "A partir do dia seguinte ao prazo.",
    icon: CircleAlert,
    className:
      "border-red-300 bg-red-50 text-red-950 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100",
    iconClassName: "text-red-600 dark:text-red-400",
  },
] as const;

function DeadlineStatusPanel({ summary }: { summary: ActionDeadlineSummary }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Status automático das ações</CardTitle>
        <CardDescription>
          Atualizado pelo calendário conforme o prazo de cada ação. Ações canceladas não entram na
          contagem.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Status por prazo">
          {DEADLINE_STATUS_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.key}
                to="/actions"
                search={{ prazo: item.key }}
                className={`group rounded-lg border p-4 transition-transform hover:-translate-y-0.5 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${item.className}`}
                aria-label={`Ver ${summary[item.key]} ações com status ${item.label}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold">{item.label}</p>
                  <Icon className={`h-5 w-5 ${item.iconClassName}`} aria-hidden="true" />
                </div>
                <p className="mt-3 text-3xl font-semibold tabular-nums">{summary[item.key]}</p>
                <p className="mt-1 text-xs opacity-80">{item.description}</p>
                <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold">
                  Ver ações
                  <ArrowRight
                    className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </span>
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function DistributionList({
  title,
  description,
  entries,
}: {
  title: string;
  description: string;
  entries: Array<{ label: string; count: number }>;
}) {
  const total = entries.reduce((sum, entry) => sum + entry.count, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <p className="text-sm text-muted-foreground">Sem dados para exibir.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {entries.map((entry) => (
              <li key={entry.label} className="grid gap-1">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{entry.label}</span>
                  <span className="tabular-nums text-muted-foreground">{entry.count}</span>
                </div>
                <div
                  className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
                  role="presentation"
                >
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${total === 0 ? 0 : (entry.count / total) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function RankingCard({
  title,
  description,
  entries,
}: {
  title: string;
  description: string;
  entries: RankingEntry[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma ação aberta com este vínculo.</p>
        ) : (
          <ol className="flex flex-col gap-2 text-sm">
            {entries.map((entry, index) => (
              <li
                key={entry.id ?? entry.label}
                className="flex items-center justify-between gap-3 border-b border-border/60 pb-2 last:border-0 last:pb-0"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="text-xs text-muted-foreground tabular-nums">{index + 1}.</span>
                  <span className="truncate">{entry.label}</span>
                </span>
                <Badge variant="secondary" className="tabular-nums">
                  {entry.count}
                </Badge>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function AttentionRow({ item, today }: { item: ActionListItem; today: string }) {
  const overdue = isActionOverdueLocal(item, today);
  return (
    <li className="flex flex-col gap-2 border-b border-border/60 py-3 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <Link
          to="/actions/$actionId"
          params={{ actionId: item.id }}
          className="truncate font-medium underline-offset-4 hover:underline"
        >
          {item.title}
        </Link>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {[item.clientName, item.vesselName, item.responsibleName].filter(Boolean).join(" · ") ||
            "Sem vínculos"}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {overdue ? (
          <Badge variant="destructive">Vencida {item.dueDate ? `· ${item.dueDate}` : ""}</Badge>
        ) : item.dueDate ? (
          <Badge variant="outline">Prazo {item.dueDate}</Badge>
        ) : null}
        <Badge variant="secondary">{ACTION_PRIORITY_LABELS[item.executionPriority]}</Badge>
        <Badge variant="outline">{ACTION_CRITICALITY_LABELS[item.operationalCriticality]}</Badge>
      </div>
    </li>
  );
}

function AttentionCard({ entries, today }: { entries: ActionListItem[]; today: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Atenção imediata</CardTitle>
        <CardDescription>
          Ações vencidas, urgentes ou de criticidade crítica, ordenadas por severidade e prazo.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma ação exige atenção imediata neste momento.
          </p>
        ) : (
          <ul className="flex flex-col">
            {entries.map((item) => (
              <AttentionRow key={item.id} item={item} today={today} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function DashboardPage() {
  const { user, profile } = Route.useRouteContext();
  const displayName = profile.fullName ?? user.email ?? "Usuário";
  const organizationName = profile.organizationName ?? "Organização não vinculada";

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchDashboardData();
      setData(result);
      setError(null);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : "Não foi possível carregar os indicadores.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const [filters, setFilters] = useState<DashboardFilters>(EMPTY_FILTERS);
  const filtered = hasActiveFilters(filters);

  const today = localDateKey();
  const filterOptions = useMemo(() => buildFilterOptions(data?.actions ?? []), [data]);

  const view = useMemo(() => {
    if (!data) return null;
    const scoped = applyFilters(data, filters, today);
    return {
      hasRows: scoped.actions.length > 0 || scoped.deliverables.length > 0,
      kpis: computeKpis(scoped.actions, scoped.deliverables, today),
      byStatus: distributionByStatus(scoped.actions).map((entry) => ({
        label: ACTION_STATUS_LABELS[entry.key],
        count: entry.count,
      })),
      byPriority: distributionByPriority(scoped.actions).map((entry) => ({
        label: ACTION_PRIORITY_LABELS[entry.key],
        count: entry.count,
      })),
      clients: rankClients(scoped.actions),
      vessels: rankVessels(scoped.actions),
      responsibles: rankResponsibles(scoped.actions),
      attention: attentionList(scoped.actions, today),
      deadlineStatuses: summarizeActionDeadlineStatuses(scoped.actions, today),
    };
  }, [data, filters, today]);

  const isEmpty = Boolean(data && data.actions.length === 0 && data.deliverables.length === 0);
  const clearFilters = useCallback(() => setFilters(EMPTY_FILTERS), []);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader
        title={`Olá, ${displayName}`}
        description={`Painel operacional da organização ${organizationName}.`}
        actions={
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw
              className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            Atualizar
          </Button>
        }
      />

      {loading ? (
        <Card>
          <CardContent
            className="py-10 text-center text-sm text-muted-foreground"
            aria-live="polite"
          >
            Carregando indicadores...
          </CardContent>
        </Card>
      ) : error ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Não foi possível carregar o dashboard</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => void load()}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      ) : isEmpty ? (
        <Card>
          <CardHeader>
            <CardTitle>Nenhum dado operacional ainda</CardTitle>
            <CardDescription>
              Sua organização ainda não possui ações ou entregáveis ativos. Assim que a primeira
              ação for registrada, os KPIs, distribuições, rankings e a lista de atenção imediata
              passam a ser calculados automaticamente.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild>
              <Link to="/actions">Ir para Ações</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/clients">Cadastrar clientes</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/vessels">Cadastrar embarcações</Link>
            </Button>
          </CardContent>
        </Card>
      ) : view ? (
        <>
          <DeadlineStatusPanel summary={view.deadlineStatuses} />

          <DashboardFiltersCard
            filters={filters}
            options={filterOptions}
            onChange={setFilters}
            onClear={clearFilters}
          />

          {filtered ? (
            <p
              className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-muted-foreground"
              role="status"
            >
              Exibindo um recorte filtrado: {view.kpis.openActions} ações abertas e{" "}
              {view.kpis.pendingDeliverables} entregáveis pendentes dentro dos filtros aplicados.
            </p>
          ) : null}

          {!view.hasRows ? (
            <Card>
              <CardHeader>
                <CardTitle>Nenhum resultado para estes filtros</CardTitle>
                <CardDescription>
                  Existem dados operacionais na organização, mas nenhum registro atende à combinação
                  de filtros selecionada. Ajuste os critérios ou limpe os filtros.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" onClick={clearFilters}>
                  Limpar filtros
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              <AttentionCard entries={view.attention} today={today} />

              <section
                className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5"
                aria-label="Indicadores operacionais"
              >
                <KpiCard
                  label="Ações abertas"
                  value={view.kpis.openActions}
                  hint="Ações que não estão concluídas nem canceladas."
                  icon={ListChecks}
                />
                <KpiCard
                  label="Ações vencidas"
                  value={view.kpis.overdueActions}
                  hint="Prazo anterior a hoje e ainda em aberto."
                  icon={CalendarClock}
                  tone="danger"
                />
                <KpiCard
                  label="Ações críticas"
                  value={view.kpis.criticalActions}
                  hint="Criticidade operacional alta ou crítica, em aberto."
                  icon={Flame}
                  tone="warning"
                />
                <KpiCard
                  label="Entregáveis pendentes"
                  value={view.kpis.pendingDeliverables}
                  hint="Entregáveis que ainda não foram finalizados."
                  icon={PackageCheck}
                />
                <KpiCard
                  label="Entregáveis vencidos"
                  value={view.kpis.overdueDeliverables}
                  hint="Prazo vencido e ainda pendentes."
                  icon={AlertTriangle}
                  tone="danger"
                />
              </section>

              <section className="grid gap-4 lg:grid-cols-2" aria-label="Distribuições">
                <DistributionList
                  title="Ações por status"
                  description="Considera todas as ações ativas da organização."
                  entries={view.byStatus}
                />
                <DistributionList
                  title="Ações abertas por prioridade"
                  description="Somente ações em aberto."
                  entries={view.byPriority}
                />
              </section>

              <section className="grid gap-4 lg:grid-cols-3" aria-label="Rankings">
                <RankingCard
                  title="Top clientes"
                  description="Clientes com mais ações abertas."
                  entries={view.clients}
                />
                <RankingCard
                  title="Top embarcações"
                  description="Embarcações com mais ações abertas."
                  entries={view.vessels}
                />
                <RankingCard
                  title="Top responsáveis"
                  description="Responsáveis com mais ações abertas."
                  entries={view.responsibles}
                />
              </section>
            </>
          )}
        </>
      ) : null}
    </div>
  );
}
