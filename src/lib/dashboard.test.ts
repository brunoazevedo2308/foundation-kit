import { describe, expect, it } from "vitest";

import type { ActionListItem } from "./actions";
import type { DeliverableListItem } from "./deliverables";
import {
  attentionList,
  computeKpis,
  distributionByPriority,
  distributionByStatus,
  isActionOpen,
  isActionOverdueLocal,
  isDeliverableOverdueLocal,
  isDeliverablePending,
  localDateKey,
  rankClients,
  rankResponsibles,
  rankVessels,
} from "./dashboard";

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

describe("localDateKey", () => {
  it("formata a data local como AAAA-MM-DD", () => {
    expect(localDateKey(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(localDateKey(new Date(2026, 11, 31))).toBe("2026-12-31");
  });
});

describe("estados abertos e vencimento", () => {
  it("trata completed e cancelled como fechados", () => {
    expect(isActionOpen(action({ id: "a", status: "completed" }))).toBe(false);
    expect(isActionOpen(action({ id: "b", status: "cancelled" }))).toBe(false);
    expect(isActionOpen(action({ id: "c", status: "in_review" }))).toBe(true);
  });

  it("só considera vencida a ação aberta com prazo anterior a hoje", () => {
    expect(isActionOverdueLocal(action({ id: "a", dueDate: "2026-08-19" }), TODAY)).toBe(true);
    expect(isActionOverdueLocal(action({ id: "b", dueDate: TODAY }), TODAY)).toBe(false);
    expect(isActionOverdueLocal(action({ id: "c", dueDate: "2026-08-21" }), TODAY)).toBe(false);
    expect(isActionOverdueLocal(action({ id: "d", dueDate: null }), TODAY)).toBe(false);
    expect(
      isActionOverdueLocal(action({ id: "e", dueDate: "2026-01-01", status: "completed" }), TODAY),
    ).toBe(false);
  });

  it("aplica a mesma regra a entregáveis", () => {
    expect(isDeliverablePending(deliverable({ id: "d1", status: "cancelled" }))).toBe(false);
    expect(isDeliverableOverdueLocal(deliverable({ id: "d2", dueDate: "2026-08-01" }), TODAY)).toBe(
      true,
    );
    expect(
      isDeliverableOverdueLocal(
        deliverable({ id: "d3", dueDate: "2026-08-01", status: "completed" }),
        TODAY,
      ),
    ).toBe(false);
  });
});

describe("computeKpis", () => {
  it("agrega abertas, vencidas, críticas e entregáveis", () => {
    const actions = [
      action({ id: "a1", dueDate: "2026-08-10", operationalCriticality: "critical" }),
      action({ id: "a2", operationalCriticality: "high" }),
      action({ id: "a3", status: "completed", dueDate: "2026-01-01" }),
      action({ id: "a4", status: "cancelled", operationalCriticality: "critical" }),
    ];
    const deliverables = [
      deliverable({ id: "d1", dueDate: "2026-08-10" }),
      deliverable({ id: "d2", status: "completed" }),
      deliverable({ id: "d3", dueDate: "2026-12-01" }),
    ];

    expect(computeKpis(actions, deliverables, TODAY)).toEqual({
      openActions: 2,
      overdueActions: 1,
      criticalActions: 2,
      pendingDeliverables: 2,
      overdueDeliverables: 1,
    });
  });

  it("retorna zeros sem dados", () => {
    expect(computeKpis([], [], TODAY)).toEqual({
      openActions: 0,
      overdueActions: 0,
      criticalActions: 0,
      pendingDeliverables: 0,
      overdueDeliverables: 0,
    });
  });
});

describe("distribuições", () => {
  it("conta todos os status, inclusive os zerados", () => {
    const dist = distributionByStatus([
      action({ id: "a1", status: "open" }),
      action({ id: "a2", status: "open" }),
      action({ id: "a3", status: "completed" }),
    ]);
    expect(dist.find((entry) => entry.key === "open")?.count).toBe(2);
    expect(dist.find((entry) => entry.key === "completed")?.count).toBe(1);
    expect(dist.find((entry) => entry.key === "planning")?.count).toBe(0);
    expect(dist).toHaveLength(7);
  });

  it("conta prioridade apenas de ações abertas", () => {
    const dist = distributionByPriority([
      action({ id: "a1", executionPriority: "urgent" }),
      action({ id: "a2", executionPriority: "urgent", status: "completed" }),
      action({ id: "a3", executionPriority: "low" }),
    ]);
    expect(dist.find((entry) => entry.key === "urgent")?.count).toBe(1);
    expect(dist.find((entry) => entry.key === "low")?.count).toBe(1);
  });
});

describe("rankings", () => {
  const actions = [
    action({
      id: "a1",
      clientId: "c1",
      clientName: "Alpha",
      vesselId: "v1",
      vesselName: "Navio A",
    }),
    action({ id: "a2", clientId: "c1", clientName: "Alpha", responsibleUserId: "u2" }),
    action({ id: "a3", clientId: "c2", clientName: "Beta" }),
    action({ id: "a4", clientId: "c2", clientName: "Beta", status: "cancelled" }),
  ];

  it("ordena clientes por contagem de ações abertas", () => {
    expect(rankClients(actions)).toEqual([
      { id: "c1", label: "Alpha", count: 2 },
      { id: "c2", label: "Beta", count: 1 },
    ]);
  });

  it("ignora ações sem embarcação", () => {
    expect(rankVessels(actions)).toEqual([{ id: "v1", label: "Navio A", count: 1 }]);
  });

  it("agrupa responsáveis e respeita o limite", () => {
    expect(rankResponsibles(actions)).toEqual([
      { id: "user-1", label: "Ana", count: 2 },
      { id: "u2", label: "Ana", count: 1 },
    ]);
    expect(rankClients(actions, 1)).toHaveLength(1);
  });
});

describe("attentionList", () => {
  it("prioriza vencidas, depois críticas e urgentes, e ignora fechadas", () => {
    const overdue = action({ id: "overdue", dueDate: "2026-08-01" });
    const critical = action({ id: "critical", operationalCriticality: "critical" });
    const urgent = action({ id: "urgent", executionPriority: "urgent" });
    const calm = action({ id: "calm" });
    const closed = action({ id: "closed", status: "completed", dueDate: "2026-01-01" });

    const result = attentionList([calm, urgent, critical, overdue, closed], TODAY);
    expect(result.map((item) => item.id)).toEqual(["overdue", "critical", "urgent"]);
  });

  it("desempata pelo prazo mais próximo e respeita o limite", () => {
    const items = [
      action({ id: "late", dueDate: "2026-08-18" }),
      action({ id: "later", dueDate: "2026-08-10" }),
    ];
    expect(attentionList(items, TODAY).map((item) => item.id)).toEqual(["later", "late"]);
    expect(attentionList(items, TODAY, 1)).toHaveLength(1);
  });

  it("retorna vazio sem ações", () => {
    expect(attentionList([], TODAY)).toEqual([]);
  });
});

describe("filtros gerenciais (US-005, 2º ciclo)", () => {
  const base = [
    action({
      id: "a1",
      clientId: "c1",
      clientName: "Cliente A",
      vesselId: "v1",
      vesselName: "Navio A",
      responsibleUserId: "u1",
      status: "open",
      executionPriority: "urgent",
      dueDate: "2026-08-10",
    }),
    action({
      id: "a2",
      clientId: "c2",
      clientName: "Cliente B",
      vesselId: null,
      vesselName: null,
      responsibleUserId: "u2",
      status: "in_progress",
      executionPriority: "low",
      dueDate: "2026-08-25",
    }),
    action({
      id: "a3",
      clientId: "c1",
      clientName: "Cliente A",
      responsibleUserId: "u1",
      status: "completed",
      executionPriority: "medium",
      dueDate: "2026-08-01",
    }),
    action({ id: "a4", responsibleUserId: "u3", dueDate: null }),
  ];

  it("addDaysKey soma dias respeitando virada de mês", () => {
    expect(addDaysKey("2026-08-20", 7)).toBe("2026-08-27");
    expect(addDaysKey("2026-08-20", 30)).toBe("2026-09-19");
    expect(addDaysKey("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("EMPTY_FILTERS não filtra nada", () => {
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0);
    expect(filterActions(base, EMPTY_FILTERS, TODAY)).toHaveLength(4);
  });

  it("conta filtros ativos", () => {
    expect(
      activeFilterCount({ ...EMPTY_FILTERS, clientId: "c1", dueWindow: "overdue" }),
    ).toBe(2);
  });

  it("filtra por cliente, embarcação e responsável", () => {
    expect(
      filterActions(base, { ...EMPTY_FILTERS, clientId: "c1" }, TODAY).map((i) => i.id),
    ).toEqual(["a1", "a3"]);
    expect(
      filterActions(base, { ...EMPTY_FILTERS, vesselId: "v1" }, TODAY).map((i) => i.id),
    ).toEqual(["a1"]);
    expect(
      filterActions(base, { ...EMPTY_FILTERS, responsibleUserId: "u3" }, TODAY).map((i) => i.id),
    ).toEqual(["a4"]);
  });

  it("filtra por status e prioridade", () => {
    expect(
      filterActions(base, { ...EMPTY_FILTERS, status: "completed" }, TODAY).map((i) => i.id),
    ).toEqual(["a3"]);
    expect(
      filterActions(base, { ...EMPTY_FILTERS, priority: "urgent" }, TODAY).map((i) => i.id),
    ).toEqual(["a1"]);
  });

  it("aplica janelas de prazo e ignora itens sem prazo", () => {
    expect(
      filterActions(base, { ...EMPTY_FILTERS, dueWindow: "overdue" }, TODAY).map((i) => i.id),
    ).toEqual(["a1"]);
    expect(
      filterActions(base, { ...EMPTY_FILTERS, dueWindow: "next7" }, TODAY).map((i) => i.id),
    ).toEqual([]);
    expect(
      filterActions(base, { ...EMPTY_FILTERS, dueWindow: "next30" }, TODAY).map((i) => i.id),
    ).toEqual(["a2"]);
  });

  it("matchesDueWindow trata limites inclusivos", () => {
    expect(matchesDueWindow("2026-08-27", true, "next7", TODAY)).toBe(true);
    expect(matchesDueWindow("2026-08-28", true, "next7", TODAY)).toBe(false);
    expect(matchesDueWindow(TODAY, true, "next7", TODAY)).toBe(true);
    expect(matchesDueWindow("2026-08-01", false, "overdue", TODAY)).toBe(false);
    expect(matchesDueWindow(null, true, "all", TODAY)).toBe(true);
  });

  it("entregáveis herdam o escopo das ações filtradas", () => {
    const items = [
      deliverable({ id: "d1", actionId: "a1", dueDate: "2026-08-25" }),
      deliverable({ id: "d2", actionId: "a2", dueDate: "2026-08-25" }),
    ];
    const scoped = applyFilters(
      { actions: base, deliverables: items },
      { ...EMPTY_FILTERS, clientId: "c1" },
      TODAY,
    );
    expect(scoped.deliverables.map((i) => i.id)).toEqual(["d1"]);
  });

  it("janela de prazo também recorta entregáveis pelo próprio prazo", () => {
    const items = [
      deliverable({ id: "d1", actionId: "a2", dueDate: "2026-08-25" }),
      deliverable({ id: "d2", actionId: "a2", dueDate: "2026-10-01" }),
    ];
    const scoped = applyFilters(
      { actions: base, deliverables: items },
      { ...EMPTY_FILTERS, dueWindow: "next30" },
      TODAY,
    );
    expect(scoped.deliverables.map((i) => i.id)).toEqual(["d1"]);
  });

  it("KPIs, distribuições, rankings e atenção respeitam o recorte", () => {
    const scoped = applyFilters(
      { actions: base, deliverables: [] },
      { ...EMPTY_FILTERS, clientId: "c1" },
      TODAY,
    );
    expect(computeKpis(scoped.actions, scoped.deliverables, TODAY)).toMatchObject({
      openActions: 1,
      overdueActions: 1,
    });
    expect(rankClients(scoped.actions)).toEqual([{ id: "c1", label: "Cliente A", count: 1 }]);
    expect(rankResponsibles(scoped.actions)).toEqual([{ id: "u1", label: "Ana", count: 1 }]);
    expect(attentionList(scoped.actions, TODAY).map((i) => i.id)).toEqual(["a1"]);
    expect(
      distributionByStatus(scoped.actions).find((entry) => entry.key === "completed")?.count,
    ).toBe(1);
    expect(
      distributionByPriority(scoped.actions).find((entry) => entry.key === "urgent")?.count,
    ).toBe(1);
  });

  it("opções de filtro derivam apenas dos dados carregados", () => {
    const options = buildFilterOptions(base);
    expect(options.clients.map((o) => o.value)).toEqual(["c1", "c2"]);
    expect(options.vessels).toEqual([{ value: "v1", label: "Navio A" }]);
    expect(options.responsibles.map((o) => o.value).sort()).toEqual(["u1", "u2", "u3"]);
    expect(buildFilterOptions([])).toEqual({ clients: [], vessels: [], responsibles: [] });
  });
});
