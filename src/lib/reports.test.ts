import { describe, expect, it } from "vitest";

import type { ActionListItem } from "./actions";
import { applyFilters, EMPTY_FILTERS, type DashboardData } from "./dashboard";
import type { DeliverableListItem } from "./deliverables";
import {
  buildReportRows,
  computeReportMetrics,
  CSV_BOM,
  CSV_HEADERS,
  deliverableProgress,
  escapeCsvValue,
  formatDateBR,
  pendingDeliverablesFor,
  reportFileName,
  toCsv,
} from "./reports";

const TODAY = "2026-08-20";

function action(overrides: Partial<ActionListItem> & { id: string }): ActionListItem {
  return {
    title: `Ação ${overrides.id}`,
    description: null,
    origin: null,
    actionType: null,
    status: "open",
    situation: "no_blockers",
    executionPriority: "medium",
    operationalCriticality: "low",
    dueDate: null,
    completedAt: null,
    clientId: null,
    clientName: null,
    vesselId: null,
    vesselName: null,
    responsibleUserId: "user-1",
    responsibleName: "Ana",
    createdAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function deliverable(
  overrides: Partial<DeliverableListItem> & { id: string },
): DeliverableListItem {
  return {
    actionId: "action-1",
    title: `Entregável ${overrides.id}`,
    description: null,
    status: "pending",
    dueDate: null,
    completedAt: null,
    sequenceNumber: 1,
    responsibleUserId: "user-1",
    responsibleName: "Ana",
    createdAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("deliverableProgress", () => {
  const deliverables = [
    deliverable({ id: "d1", actionId: "a1", status: "completed" }),
    deliverable({ id: "d2", actionId: "a1", status: "pending" }),
    deliverable({ id: "d3", actionId: "a1", status: "completed" }),
    deliverable({ id: "d4", actionId: "a2", status: "pending" }),
  ];

  it("conta apenas os entregáveis da ação", () => {
    expect(deliverableProgress("a1", deliverables)).toEqual({
      total: 3,
      completed: 2,
      percent: 67,
    });
  });

  it("retorna zero quando a ação não tem entregáveis", () => {
    expect(deliverableProgress("a9", deliverables)).toEqual({
      total: 0,
      completed: 0,
      percent: 0,
    });
  });
});

describe("buildReportRows / computeReportMetrics", () => {
  const data: DashboardData = {
    actions: [
      action({ id: "a1", dueDate: "2026-08-10" }), // aberta e vencida
      action({ id: "a2", status: "completed", dueDate: "2026-08-10" }), // fechada, não vencida
      action({ id: "a3", operationalCriticality: "critical" }),
      action({ id: "a4", status: "cancelled" }),
    ],
    deliverables: [
      deliverable({ id: "d1", actionId: "a1", status: "completed" }),
      deliverable({ id: "d2", actionId: "a1", status: "pending" }),
    ],
  };

  const rows = buildReportRows(data, TODAY);

  it("marca vencimento pela data local e só para ações abertas", () => {
    expect(rows.find((r) => r.action.id === "a1")?.overdue).toBe(true);
    expect(rows.find((r) => r.action.id === "a2")?.overdue).toBe(false);
  });

  it("calcula as métricas do recorte", () => {
    expect(computeReportMetrics(rows)).toEqual({
      total: 4,
      open: 2,
      overdue: 1,
      closed: 2,
      critical: 1,
    });
  });

  it("conta entregáveis pendentes apenas das ações do recorte", () => {
    expect(pendingDeliverablesFor(rows, data)).toBe(1);
  });

  it("respeita filtros combinados antes da agregação", () => {
    const scoped = applyFilters(
      data,
      { ...EMPTY_FILTERS, status: "open", dueWindow: "overdue" },
      TODAY,
    );
    const filteredRows = buildReportRows(scoped, TODAY);
    expect(filteredRows.map((r) => r.action.id)).toEqual(["a1"]);
    expect(computeReportMetrics(filteredRows).total).toBe(1);
  });
});

describe("formatDateBR", () => {
  it("converte AAAA-MM-DD em DD/MM/AAAA", () => {
    expect(formatDateBR("2026-08-20")).toBe("20/08/2026");
  });

  it("retorna string vazia para nulo", () => {
    expect(formatDateBR(null)).toBe("");
  });
});

describe("escapeCsvValue", () => {
  it("mantém valores simples sem aspas", () => {
    expect(escapeCsvValue("Inspeção anual")).toBe("Inspeção anual");
  });

  it("cerca valores com vírgula", () => {
    expect(escapeCsvValue("DP, anual")).toBe('"DP, anual"');
  });

  it("duplica aspas internas", () => {
    expect(escapeCsvValue('Teste "FMEA"')).toBe('"Teste ""FMEA"""');
  });

  it("cerca quebras de linha", () => {
    expect(escapeCsvValue("linha1\nlinha2")).toBe('"linha1\nlinha2"');
  });

  it("serializa nulo como vazio", () => {
    expect(escapeCsvValue(null)).toBe("");
  });
});

describe("toCsv", () => {
  const data: DashboardData = {
    actions: [
      action({
        id: "a1",
        title: 'Auditoria "DP", fase 1\nparte 2',
        clientName: "Cliente A",
        vesselName: "Navio B",
        dueDate: "2026-08-10",
      }),
      action({ id: "a2", status: "completed" }),
    ],
    deliverables: [deliverable({ id: "d1", actionId: "a1", status: "completed" })],
  };

  it("inclui BOM e cabeçalhos PT-BR", () => {
    const csv = toCsv(buildReportRows(data, TODAY));
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    expect(csv.slice(1).split("\r\n")[0]).toBe(CSV_HEADERS.join(","));
  });

  it("permite desativar o BOM", () => {
    expect(toCsv(buildReportRows(data, TODAY), false).startsWith(CSV_BOM)).toBe(false);
  });

  it("escapa vírgula, aspas e quebra de linha no conteúdo", () => {
    const csv = toCsv(buildReportRows(data, TODAY), false);
    expect(csv).toContain('"Auditoria ""DP"", fase 1\nparte 2"');
  });

  it("exporta somente o recorte filtrado", () => {
    const scoped = applyFilters(data, { ...EMPTY_FILTERS, status: "completed" }, TODAY);
    const csv = toCsv(buildReportRows(scoped, TODAY), false);
    const lines = csv.trimEnd().split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("Ação a2");
    expect(csv).not.toContain("Auditoria");
  });

  it("apresenta datas em PT-BR e progresso de entregáveis", () => {
    const csv = toCsv(buildReportRows(data, TODAY), false);
    expect(csv).toContain("10/08/2026");
    expect(csv).toContain(",Sim,1,1,100,");
  });
});

describe("reportFileName", () => {
  it("gera nome previsível e seguro", () => {
    expect(reportFileName(TODAY)).toBe("dp-suite-relatorio-acoes-2026-08-20.csv");
  });

  it("ignora entradas fora do formato esperado", () => {
    expect(reportFileName("../../etc/passwd")).toMatch(
      /^dp-suite-relatorio-acoes-\d{4}-\d{2}-\d{2}\.csv$/,
    );
  });
});
