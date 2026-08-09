import { describe, expect, it } from "vitest";

import {
  DeliverableFormSchema,
  deliverableProgress,
  isDeliverableOverdue,
  mapDeliverable,
  nextSequenceNumber,
  resolveDeliverableCompletedAt,
  toDeliverableFormInput,
  type DeliverableListItem,
} from "./deliverables";

const VALID = {
  title: "  Relatório de trials  ",
  description: "",
  responsibleUserId: "0f10f14c-a74d-41c2-81c3-c67ac69e9f12",
  status: "pending",
  dueDate: "",
  sequenceNumber: 1,
} as const;

const base: DeliverableListItem = {
  id: "d1",
  actionId: "a1",
  title: "Entregável",
  description: null,
  status: "pending",
  dueDate: "2026-01-01",
  completedAt: null,
  sequenceNumber: 2,
  responsibleUserId: "0f10f14c-a74d-41c2-81c3-c67ac69e9f12",
  responsibleName: null,
  createdAt: "2026-01-01T00:00:00Z",
};

describe("DeliverableFormSchema", () => {
  it("normaliza texto e converte opcionais vazios em null", () => {
    const parsed = DeliverableFormSchema.parse(VALID);
    expect(parsed.title).toBe("Relatório de trials");
    expect(parsed.description).toBeNull();
    expect(parsed.dueDate).toBeNull();
    expect(parsed.sequenceNumber).toBe(1);
  });

  it("rejeita responsável ausente, status inválido, data e ordem inválidas", () => {
    expect(DeliverableFormSchema.safeParse({ ...VALID, responsibleUserId: "" }).success).toBe(
      false,
    );
    expect(DeliverableFormSchema.safeParse({ ...VALID, status: "archived" }).success).toBe(false);
    expect(DeliverableFormSchema.safeParse({ ...VALID, dueDate: "31/12/2026" }).success).toBe(
      false,
    );
    expect(DeliverableFormSchema.safeParse({ ...VALID, sequenceNumber: 0 }).success).toBe(false);
    expect(DeliverableFormSchema.safeParse({ ...VALID, sequenceNumber: 1.5 }).success).toBe(false);
  });
});

describe("mapDeliverable", () => {
  it("achata a relação de responsável", () => {
    const item = mapDeliverable({
      id: "d1",
      action_id: "a1",
      title: "Entregável",
      description: null,
      status: "in_review",
      due_date: null,
      completed_at: null,
      sequence_number: 3,
      responsible_user_id: "u1",
      created_at: "2026-08-01T00:00:00Z",
      profiles: [{ full_name: "Ana" }],
    });
    expect(item.responsibleName).toBe("Ana");
    expect(item.sequenceNumber).toBe(3);
  });
});

describe("isDeliverableOverdue", () => {
  const today = new Date("2026-08-09T00:00:00Z");

  it("marca vencido apenas quando ainda está em andamento", () => {
    expect(isDeliverableOverdue(base, today)).toBe(true);
    expect(isDeliverableOverdue({ ...base, status: "completed" }, today)).toBe(false);
    expect(isDeliverableOverdue({ ...base, status: "cancelled" }, today)).toBe(false);
    expect(isDeliverableOverdue({ ...base, dueDate: null }, today)).toBe(false);
  });
});

describe("resolveDeliverableCompletedAt", () => {
  const now = new Date("2026-08-09T10:00:00.000Z");

  it("limpa fora de concluído e preserva o valor existente", () => {
    expect(resolveDeliverableCompletedAt("pending", "2026-01-01T00:00:00Z", now)).toBeNull();
    expect(resolveDeliverableCompletedAt("completed", null, now)).toBe("2026-08-09T10:00:00.000Z");
    expect(resolveDeliverableCompletedAt("completed", "2026-01-01T00:00:00Z", now)).toBe(
      "2026-01-01T00:00:00Z",
    );
  });
});

describe("nextSequenceNumber e deliverableProgress", () => {
  it("sugere a próxima ordem livre", () => {
    expect(nextSequenceNumber([])).toBe(1);
    expect(nextSequenceNumber([base, { ...base, id: "d2", sequenceNumber: 5 }])).toBe(6);
  });

  it("calcula progresso ignorando cancelados", () => {
    expect(deliverableProgress([])).toBe(0);
    expect(
      deliverableProgress([
        { ...base, status: "completed" },
        { ...base, id: "d2", status: "pending" },
        { ...base, id: "d3", status: "cancelled" },
      ]),
    ).toBe(50);
  });
});

describe("toDeliverableFormInput", () => {
  it("converte nulos em strings vazias válidas para o formulário", () => {
    const form = toDeliverableFormInput({ ...base, dueDate: null });
    expect(form.description).toBe("");
    expect(form.dueDate).toBe("");
    expect(DeliverableFormSchema.safeParse(form).success).toBe(true);
  });
});
