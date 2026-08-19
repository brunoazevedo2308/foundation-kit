import {
  ACTION_PRIORITIES,
  ACTION_STATUSES,
  mapAction,
  type ActionCriticality,
  type ActionListItem,
  type ActionPriority,
  type ActionStatus,
} from "./actions";
import {
  mapDeliverable,
  type DeliverableListItem,
  type DeliverableStatus,
} from "./deliverables";
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
