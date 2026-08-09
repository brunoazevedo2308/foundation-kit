import { describe, expect, it } from "vitest";

import {
  ActionFormSchema,
  isOverdue,
  mapAction,
  resolveCompletedAt,
  toActionFormInput,
  type ActionListItem,
} from "./actions";

const VALID = {
  title: "  Revisar FMEA  ",
  description: "",
  origin: " Auditoria ",
  actionType: "",
  responsibleUserId: "0f10f14c-a74d-41c2-81c3-c67ac69e9f12",
  clientId: "",
  vesselId: "",
  executionPriority: "high",
  operationalCriticality: "critical",
  status: "open",
  situation: "no_blockers",
  dueDate: "",
} as const;

describe("ActionFormSchema", () => {
  it("normaliza campos e converte opcionais vazios em null", () => {
    const parsed = ActionFormSchema.parse(VALID);
    expect(parsed.title).toBe("Revisar FMEA");
    expect(parsed.description).toBeNull();
    expect(parsed.origin).toBe("Auditoria");
    expect(parsed.clientId).toBeNull();
    expect(parsed.vesselId).toBeNull();
    expect(parsed.dueDate).toBeNull();
  });

  it("rejeita responsável ausente, status inválido e data malformada", () => {
    expect(ActionFormSchema.safeParse({ ...VALID, responsibleUserId: "" }).success).toBe(false);
    expect(ActionFormSchema.safeParse({ ...VALID, status: "archived" }).success).toBe(false);
    expect(ActionFormSchema.safeParse({ ...VALID, dueDate: "31/12/2026" }).success).toBe(false);
    expect(ActionFormSchema.safeParse({ ...VALID, title: "ab " }).success).toBe(false);
  });

  it("aceita vínculos válidos com cliente, embarcação e data", () => {
    const parsed = ActionFormSchema.parse({
      ...VALID,
      clientId: "0f10f14c-a74d-41c2-81c3-c67ac69e9f12",
      vesselId: "1f10f14c-a74d-41c2-81c3-c67ac69e9f13",
      dueDate: "2026-12-31",
    });
    expect(parsed.vesselId).toBe("1f10f14c-a74d-41c2-81c3-c67ac69e9f13");
    expect(parsed.dueDate).toBe("2026-12-31");
  });
});

describe("mapAction", () => {
  it("achata relações retornadas como array ou objeto", () => {
    const item = mapAction({
      id: "a1",
      title: "Ação",
      description: null,
      origin: null,
      action_type: null,
      status: "open",
      situation: "no_blockers",
      execution_priority: "medium",
      operational_criticality: "low",
      due_date: null,
      completed_at: null,
      client_id: "c1",
      vessel_id: "v1",
      responsible_user_id: "u1",
      created_at: "2026-08-01T00:00:00Z",
      clients: [{ name: "Petro" }],
      vessels: { name: "Skandi" },
      profiles: { full_name: "Ana" },
    });

    expect(item.clientName).toBe("Petro");
    expect(item.vesselName).toBe("Skandi");
    expect(item.responsibleName).toBe("Ana");
  });
});

describe("isOverdue", () => {
  const base: ActionListItem = {
    id: "a1",
    title: "Ação",
    description: null,
    origin: null,
    actionType: null,
    status: "open",
    situation: "no_blockers",
    executionPriority: "medium",
    operationalCriticality: "low",
    dueDate: "2026-01-01",
    completedAt: null,
    clientId: null,
    clientName: null,
    vesselId: null,
    vesselName: null,
    responsibleUserId: "u1",
    responsibleName: null,
    createdAt: "2026-01-01T00:00:00Z",
  };
  const today = new Date("2026-08-09T00:00:00Z");

  it("marca vencida apenas quando ainda está em aberto", () => {
    expect(isOverdue(base, today)).toBe(true);
    expect(isOverdue({ ...base, status: "completed" }, today)).toBe(false);
    expect(isOverdue({ ...base, status: "cancelled" }, today)).toBe(false);
    expect(isOverdue({ ...base, dueDate: null }, today)).toBe(false);
    expect(isOverdue({ ...base, dueDate: "2026-12-01" }, today)).toBe(false);
  });
});

describe("resolveCompletedAt", () => {
  const now = new Date("2026-08-09T10:00:00.000Z");

  it("limpa completed_at fora do status concluída", () => {
    expect(resolveCompletedAt("open", "2026-01-01T00:00:00Z", now)).toBeNull();
    expect(resolveCompletedAt("cancelled", null, now)).toBeNull();
  });

  it("preenche ao concluir e preserva o valor existente", () => {
    expect(resolveCompletedAt("completed", null, now)).toBe("2026-08-09T10:00:00.000Z");
    expect(resolveCompletedAt("completed", "2026-01-01T00:00:00Z", now)).toBe(
      "2026-01-01T00:00:00Z",
    );
  });
});

describe("toActionFormInput", () => {
  it("converte nulos em strings vazias para o formulário", () => {
    const item: ActionListItem = {
      id: "a1",
      title: "Ação",
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
      responsibleUserId: "0f10f14c-a74d-41c2-81c3-c67ac69e9f12",
      responsibleName: null,
      createdAt: "2026-01-01T00:00:00Z",
    };
    const form = toActionFormInput(item);
    expect(form.description).toBe("");
    expect(form.clientId).toBe("");
    expect(form.dueDate).toBe("");
    expect(ActionFormSchema.safeParse(form).success).toBe(true);
  });
});
