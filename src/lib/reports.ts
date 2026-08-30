import {
  ACTION_CRITICALITY_LABELS,
  ACTION_PRIORITY_LABELS,
  ACTION_SITUATION_LABELS,
  ACTION_STATUS_LABELS,
  type ActionCriticality,
  type ActionListItem,
} from "./actions";
import type { DeliverableListItem } from "./deliverables";
import {
  isActionOpen,
  isActionOverdueLocal,
  isDeliverablePending,
  localDateKey,
  type DashboardData,
} from "./dashboard";

/**
 * US-009 (MVP) — Relatórios e Exportação.
 *
 * Camada pura de agregação e serialização. Não faz leitura própria: consome
 * exatamente o mesmo recorte tenant-scoped já carregado pelo dashboard
 * (`fetchDashboardData`), onde a RLS é a única fonte de verdade e registros
 * com `deleted_at` são descartados na origem.
 */

const CLOSED_CRITICAL: ReadonlySet<ActionCriticality> = new Set<ActionCriticality>([
  "high",
  "critical",
]);

export type DeliverableProgress = {
  total: number;
  completed: number;
  /** 0..100, arredondado; 0 quando a ação não tem entregáveis. */
  percent: number;
};

export type ReportRow = {
  action: ActionListItem;
  overdue: boolean;
  progress: DeliverableProgress;
};

export type ReportMetrics = {
  total: number;
  open: number;
  overdue: number;
  closed: number;
  critical: number;
};

export function deliverableProgress(
  actionId: string,
  deliverables: DeliverableListItem[],
): DeliverableProgress {
  const scoped = deliverables.filter((item) => item.actionId === actionId);
  const total = scoped.length;
  const completed = scoped.filter((item) => item.status === "completed").length;
  return {
    total,
    completed,
    percent: total === 0 ? 0 : Math.round((completed / total) * 100),
  };
}

/** Monta as linhas do relatório a partir de um recorte já filtrado. */
export function buildReportRows(data: DashboardData, today = localDateKey()): ReportRow[] {
  return data.actions.map((action) => ({
    action,
    overdue: isActionOverdueLocal(action, today),
    progress: deliverableProgress(action.id, data.deliverables),
  }));
}

export function computeReportMetrics(rows: ReportRow[]): ReportMetrics {
  const open = rows.filter((row) => isActionOpen(row.action));
  return {
    total: rows.length,
    open: open.length,
    overdue: rows.filter((row) => row.overdue).length,
    closed: rows.length - open.length,
    critical: open.filter((row) => CLOSED_CRITICAL.has(row.action.operationalCriticality)).length,
  };
}

export function pendingDeliverablesFor(rows: ReportRow[], data: DashboardData): number {
  const ids = new Set(rows.map((row) => row.action.id));
  return data.deliverables.filter((item) => ids.has(item.actionId) && isDeliverablePending(item))
    .length;
}

/** Converte `AAAA-MM-DD` em `DD/MM/AAAA` sem depender de fuso. */
export function formatDateBR(value: string | null): string {
  if (!value) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

/** Converte timestamp ISO em `DD/MM/AAAA HH:mm` (hora local do usuário). */
export function formatDateTimeBR(value: string | null): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(parsed.getDate())}/${pad(parsed.getMonth() + 1)}/${parsed.getFullYear()} ${pad(
    parsed.getHours(),
  )}:${pad(parsed.getMinutes())}`;
}

export const CSV_HEADERS = [
  "Título",
  "Cliente",
  "Embarcação",
  "Responsável",
  "Status",
  "Situação",
  "Prioridade",
  "Criticidade",
  "Prazo",
  "Vencida",
  "Entregáveis concluídos",
  "Entregáveis totais",
  "Progresso (%)",
  "Concluída em",
  "Criada em",
] as const;

export const CSV_BOM = "\uFEFF";

/** Escapa um campo CSV: aspas duplicadas e cerca para vírgula/aspas/quebra. */
export function escapeCsvValue(value: unknown): string {
  const raw = value === null || value === undefined ? "" : String(value);
  if (/[",\r\n]/.test(raw)) return `"${raw.replaceAll('"', '""')}"`;
  return raw;
}

export function reportRowToCsvFields(row: ReportRow): string[] {
  const a = row.action;
  return [
    a.title,
    a.clientName ?? "",
    a.vesselName ?? "",
    a.responsibleName ?? "",
    ACTION_STATUS_LABELS[a.status],
    ACTION_SITUATION_LABELS[a.situation],
    ACTION_PRIORITY_LABELS[a.executionPriority],
    ACTION_CRITICALITY_LABELS[a.operationalCriticality],
    formatDateBR(a.dueDate),
    row.overdue ? "Sim" : "Não",
    String(row.progress.completed),
    String(row.progress.total),
    String(row.progress.percent),
    formatDateTimeBR(a.completedAt),
    formatDateTimeBR(a.createdAt),
  ];
}

/** Serializa somente o recorte recebido. CRLF + BOM para compatibilidade com Excel. */
export function toCsv(rows: ReportRow[], withBom = true): string {
  const lines = [
    CSV_HEADERS.map(escapeCsvValue).join(","),
    ...rows.map((row) => reportRowToCsvFields(row).map(escapeCsvValue).join(",")),
  ];
  return `${withBom ? CSV_BOM : ""}${lines.join("\r\n")}\r\n`;
}

/** Nome de arquivo previsível e seguro: `dp-suite-relatorio-acoes-AAAA-MM-DD.csv`. */
export function reportFileName(today = localDateKey()): string {
  const safe = /^\d{4}-\d{2}-\d{2}$/.test(today) ? today : localDateKey();
  return `dp-suite-relatorio-acoes-${safe}.csv`;
}
