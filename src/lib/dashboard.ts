import {
  ACTION_PRIORITIES,
  ACTION_STATUSES,
  mapAction,
  type ActionCriticality,
  type ActionListItem,
  type ActionPriority,
  type ActionStatus,
} from "./actions";
import { mapDeliverable, type DeliverableListItem, type DeliverableStatus } from "./deliverables";
import { emitEvent, sanitize } from "./observability";
import { supabase } from "./supabase";

/**
 * US-005 (1º ciclo) — camada de dados do Dashboard Operacional.
 *
 * Todas as leituras usam a chave publishable + sessão; a RLS multi-tenant é a
 * fonte da verdade do escopo. Nenhuma tabela nova, nenhuma service_role.
 * As agregações são puras e testáveis, independentes de dados reais.
 */

function client() {
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.",
    );
  }
  return supabase;
}

/** Data local (fuso do usuário) em formato AAAA-MM-DD, comparável a `due_date`. */
export function localDateKey(reference: Date = new Date()): string {
  const year = reference.getFullYear();
  const month = String(reference.getMonth() + 1).padStart(2, "0");
  const day = String(reference.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const CLOSED_ACTION_STATUSES: ReadonlySet<ActionStatus> = new Set<ActionStatus>([
  "completed",
  "cancelled",
]);

const CLOSED_DELIVERABLE_STATUSES: ReadonlySet<DeliverableStatus> = new Set<DeliverableStatus>([
  "completed",
  "cancelled",
]);

export function isActionOpen(item: ActionListItem): boolean {
  return !CLOSED_ACTION_STATUSES.has(item.status);
}

export function isActionOverdueLocal(item: ActionListItem, today = localDateKey()): boolean {
  if (!item.dueDate) return false;
  if (!isActionOpen(item)) return false;
  return item.dueDate < today;
}

export function isDeliverablePending(item: DeliverableListItem): boolean {
  return !CLOSED_DELIVERABLE_STATUSES.has(item.status);
}

export function isDeliverableOverdueLocal(
  item: DeliverableListItem,
  today = localDateKey(),
): boolean {
  if (!item.dueDate) return false;
  if (!isDeliverablePending(item)) return false;
  return item.dueDate < today;
}

const CRITICAL_LEVELS: ReadonlySet<ActionCriticality> = new Set<ActionCriticality>([
  "high",
  "critical",
]);

export type DashboardKpis = {
  openActions: number;
  overdueActions: number;
  criticalActions: number;
  pendingDeliverables: number;
  overdueDeliverables: number;
};

export function computeKpis(
  actions: ActionListItem[],
  deliverables: DeliverableListItem[],
  today = localDateKey(),
): DashboardKpis {
  const open = actions.filter(isActionOpen);
  return {
    openActions: open.length,
    overdueActions: actions.filter((item) => isActionOverdueLocal(item, today)).length,
    criticalActions: open.filter((item) => CRITICAL_LEVELS.has(item.operationalCriticality)).length,
    pendingDeliverables: deliverables.filter(isDeliverablePending).length,
    overdueDeliverables: deliverables.filter((item) => isDeliverableOverdueLocal(item, today))
      .length,
  };
}

export type Distribution<T extends string> = Array<{ key: T; count: number }>;

export function distributionByStatus(actions: ActionListItem[]): Distribution<ActionStatus> {
  return ACTION_STATUSES.map((key) => ({
    key,
    count: actions.filter((item) => item.status === key).length,
  }));
}

export function distributionByPriority(actions: ActionListItem[]): Distribution<ActionPriority> {
  const open = actions.filter(isActionOpen);
  return ACTION_PRIORITIES.map((key) => ({
    key,
    count: open.filter((item) => item.executionPriority === key).length,
  }));
}

export type RankingEntry = { id: string | null; label: string; count: number };

function rank(
  actions: ActionListItem[],
  pick: (item: ActionListItem) => { id: string | null; label: string } | null,
  limit: number,
): RankingEntry[] {
  const buckets = new Map<string, RankingEntry>();
  for (const item of actions.filter(isActionOpen)) {
    const target = pick(item);
    if (!target) continue;
    const key = target.id ?? target.label;
    const current = buckets.get(key);
    if (current) current.count += 1;
    else buckets.set(key, { id: target.id, label: target.label, count: 1 });
  }
  return [...buckets.values()]
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
}

export function rankClients(actions: ActionListItem[], limit = 5): RankingEntry[] {
  return rank(
    actions,
    (item) => (item.clientId ? { id: item.clientId, label: item.clientName ?? "Cliente" } : null),
    limit,
  );
}

export function rankVessels(actions: ActionListItem[], limit = 5): RankingEntry[] {
  return rank(
    actions,
    (item) =>
      item.vesselId ? { id: item.vesselId, label: item.vesselName ?? "Embarcação" } : null,
    limit,
  );
}

export function rankResponsibles(actions: ActionListItem[], limit = 5): RankingEntry[] {
  return rank(
    actions,
    (item) => ({
      id: item.responsibleUserId,
      label: item.responsibleName ?? "Sem nome",
    }),
    limit,
  );
}

/** Ações que exigem atenção imediata: vencidas, urgentes ou críticas. */
export function attentionList(
  actions: ActionListItem[],
  today = localDateKey(),
  limit = 8,
): ActionListItem[] {
  const scored = actions
    .filter(isActionOpen)
    .map((item) => {
      const overdue = isActionOverdueLocal(item, today);
      const urgent = item.executionPriority === "urgent";
      const critical = item.operationalCriticality === "critical";
      const score = (overdue ? 4 : 0) + (critical ? 2 : 0) + (urgent ? 1 : 0);
      return { item, score };
    })
    .filter((entry) => entry.score > 0);

  return scored
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const aDue = a.item.dueDate ?? "9999-12-31";
      const bDue = b.item.dueDate ?? "9999-12-31";
      return aDue.localeCompare(bDue);
    })
    .slice(0, limit)
    .map((entry) => entry.item);
}

export type DashboardData = {
  actions: ActionListItem[];
  deliverables: DeliverableListItem[];
};

/**
 * US-005 (2º ciclo) — filtros gerenciais.
 *
 * Todos os filtros são aplicados em memória sobre os dados já carregados e
 * tenant-scoped pela RLS. Nenhum filtro amplia o escopo de leitura.
 */

export const DUE_WINDOWS = ["all", "overdue", "next7", "next30"] as const;
export type DueWindow = (typeof DUE_WINDOWS)[number];

export const DUE_WINDOW_LABELS: Record<DueWindow, string> = {
  all: "Todos os prazos",
  overdue: "Vencidos",
  next7: "Próximos 7 dias",
  next30: "Próximos 30 dias",
};

export type DashboardFilters = {
  clientId: string | null;
  vesselId: string | null;
  responsibleUserId: string | null;
  status: ActionStatus | null;
  priority: ActionPriority | null;
  dueWindow: DueWindow;
};

export const EMPTY_FILTERS: DashboardFilters = {
  clientId: null,
  vesselId: null,
  responsibleUserId: null,
  status: null,
  priority: null,
  dueWindow: "all",
};

export function activeFilterCount(filters: DashboardFilters): number {
  let count = 0;
  if (filters.clientId) count += 1;
  if (filters.vesselId) count += 1;
  if (filters.responsibleUserId) count += 1;
  if (filters.status) count += 1;
  if (filters.priority) count += 1;
  if (filters.dueWindow !== "all") count += 1;
  return count;
}

export function hasActiveFilters(filters: DashboardFilters): boolean {
  return activeFilterCount(filters) > 0;
}

/** Soma dias a uma chave AAAA-MM-DD, retornando outra chave AAAA-MM-DD. */
export function addDaysKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const reference = new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
  reference.setDate(reference.getDate() + days);
  return localDateKey(reference);
}

/**
 * Regras da janela de prazo:
 * - `all`: não filtra;
 * - `overdue`: prazo anterior a hoje e item ainda aberto/pendente;
 * - `next7` / `next30`: prazo entre hoje e hoje + N dias (inclusive).
 * Itens sem prazo são excluídos em qualquer janela diferente de `all`.
 */
export function matchesDueWindow(
  dueDate: string | null,
  open: boolean,
  window: DueWindow,
  today = localDateKey(),
): boolean {
  if (window === "all") return true;
  if (!dueDate) return false;
  if (window === "overdue") return open && dueDate < today;
  const days = window === "next7" ? 7 : 30;
  return dueDate >= today && dueDate <= addDaysKey(today, days);
}

export function filterActions(
  actions: ActionListItem[],
  filters: DashboardFilters,
  today = localDateKey(),
): ActionListItem[] {
  return actions.filter((item) => {
    if (filters.clientId && item.clientId !== filters.clientId) return false;
    if (filters.vesselId && item.vesselId !== filters.vesselId) return false;
    if (filters.responsibleUserId && item.responsibleUserId !== filters.responsibleUserId)
      return false;
    if (filters.status && item.status !== filters.status) return false;
    if (filters.priority && item.executionPriority !== filters.priority) return false;
    return matchesDueWindow(item.dueDate, isActionOpen(item), filters.dueWindow, today);
  });
}

/**
 * Entregáveis herdam o escopo das ações filtradas (cliente, embarcação,
 * responsável da ação, status e prioridade) e, quando há janela de prazo,
 * respeitam também o próprio `due_date`.
 */
export function filterDeliverables(
  deliverables: DeliverableListItem[],
  visibleActionIds: ReadonlySet<string>,
  filters: DashboardFilters,
  today = localDateKey(),
): DeliverableListItem[] {
  return deliverables.filter((item) => {
    if (!visibleActionIds.has(item.actionId)) return false;
    return matchesDueWindow(item.dueDate, isDeliverablePending(item), filters.dueWindow, today);
  });
}

export function applyFilters(
  data: DashboardData,
  filters: DashboardFilters,
  today = localDateKey(),
): DashboardData {
  const actions = filterActions(data.actions, filters, today);
  const ids = new Set(actions.map((item) => item.id));
  return {
    actions,
    deliverables: filterDeliverables(data.deliverables, ids, filters, today),
  };
}

export type FilterOption = { value: string; label: string };

export type DashboardFilterOptions = {
  clients: FilterOption[];
  vessels: FilterOption[];
  responsibles: FilterOption[];
};

function options(
  actions: ActionListItem[],
  pick: (item: ActionListItem) => FilterOption | null,
): FilterOption[] {
  const map = new Map<string, FilterOption>();
  for (const item of actions) {
    const option = pick(item);
    if (option && !map.has(option.value)) map.set(option.value, option);
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/** Opções derivadas apenas dos dados já carregados (sem novas leituras). */
export function buildFilterOptions(actions: ActionListItem[]): DashboardFilterOptions {
  return {
    clients: options(actions, (item) =>
      item.clientId ? { value: item.clientId, label: item.clientName ?? "Cliente" } : null,
    ),
    vessels: options(actions, (item) =>
      item.vesselId ? { value: item.vesselId, label: item.vesselName ?? "Embarcação" } : null,
    ),
    responsibles: options(actions, (item) => ({
      value: item.responsibleUserId,
      label: item.responsibleName ?? "Sem nome",
    })),
  };
}

const ACTION_COLUMNS =
  "id, title, description, origin, action_type, status, situation, execution_priority, operational_criticality, due_date, completed_at, client_id, vessel_id, responsible_user_id, created_at, clients(name), vessels(name), profiles!actions_responsible_user_id_fkey(full_name)";

const DELIVERABLE_COLUMNS =
  "id, action_id, title, description, status, due_date, completed_at, sequence_number, responsible_user_id, created_at, profiles!deliverables_responsible_user_id_fkey(full_name)";

/** Carrega ações e entregáveis ativos da organização (tenant-scoped por RLS). */
export async function fetchDashboardData(): Promise<DashboardData> {
  const c = client();

  const [actionsResult, deliverablesResult] = await Promise.all([
    c
      .from("actions")
      .select(ACTION_COLUMNS)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    c
      .from("deliverables")
      .select(DELIVERABLE_COLUMNS)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
  ]);

  const error = actionsResult.error ?? deliverablesResult.error;
  if (error) {
    emitEvent({
      event_name: "backend.request.failure",
      context: { operation: "dashboard.load", supabase_error: sanitize(error) },
    });
    throw new Error("Não foi possível carregar os indicadores do dashboard.");
  }

  return {
    actions: ((actionsResult.data ?? []) as Parameters<typeof mapAction>[0][]).map(mapAction),
    deliverables: ((deliverablesResult.data ?? []) as Parameters<typeof mapDeliverable>[0][]).map(
      mapDeliverable,
    ),
  };
}
