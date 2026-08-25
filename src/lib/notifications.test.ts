import { describe, expect, it } from "vitest";

import {
  countUnread,
  formatNotificationTimestamp,
  isUnread,
  mapNotification,
  notificationTarget,
  notificationTypeLabel,
  type NotificationItem,
} from "./notifications";

function item(over: Partial<NotificationItem> = {}): NotificationItem {
  return {
    id: "n1",
    notificationType: "action.assigned",
    title: "Você foi designado para uma ação",
    body: "Inspeção anual DP",
    entityType: "action",
    entityId: "a1",
    readAt: null,
    createdAt: "2026-08-20T10:00:00.000Z",
    ...over,
  };
}

describe("mapNotification", () => {
  it("mapeia uma linha completa", () => {
    expect(
      mapNotification({
        id: "n1",
        notification_type: "action.assigned",
        title: "Nova ação",
        body: "Detalhe",
        entity_type: "action",
        entity_id: "a1",
        read_at: "2026-08-21T12:00:00.000Z",
        created_at: "2026-08-20T10:00:00.000Z",
      }),
    ).toEqual({
      id: "n1",
      notificationType: "action.assigned",
      title: "Nova ação",
      body: "Detalhe",
      entityType: "action",
      entityId: "a1",
      readAt: "2026-08-21T12:00:00.000Z",
      createdAt: "2026-08-20T10:00:00.000Z",
    });
  });

  it("preserva campos nulos (body/entity)", () => {
    const mapped = mapNotification({
      id: "n2",
      notification_type: "system.announcement",
      title: "Aviso",
      body: null,
      entity_type: null,
      entity_id: null,
      read_at: null,
      created_at: "2026-08-20T10:00:00.000Z",
    });
    expect(mapped.body).toBeNull();
    expect(mapped.entityType).toBeNull();
    expect(mapped.entityId).toBeNull();
  });
});

describe("isUnread / countUnread", () => {
  it("considera não lida quando readAt é null", () => {
    expect(isUnread(item({ readAt: null }))).toBe(true);
    expect(isUnread(item({ readAt: "2026-08-21T12:00:00.000Z" }))).toBe(false);
  });

  it("conta apenas não lidas", () => {
    const items = [
      item({ id: "1", readAt: null }),
      item({ id: "2", readAt: "2026-08-21T12:00:00.000Z" }),
      item({ id: "3", readAt: null }),
    ];
    expect(countUnread(items)).toBe(2);
    expect(countUnread([])).toBe(0);
  });
});

describe("notificationTarget", () => {
  it("aponta entity_type=action para a própria ação", () => {
    expect(notificationTarget(item())).toEqual({ type: "action", actionId: "a1" });
  });

  it("aponta entity_type=deliverable para a ação pai quando o mapa foi resolvido", () => {
    const map = new Map([["d1", "a9"]]);
    expect(notificationTarget(item({ entityType: "deliverable", entityId: "d1" }), map)).toEqual({
      type: "action",
      actionId: "a9",
    });
  });

  it("não gera link para deliverable sem mapa resolvido (não inventa schema)", () => {
    expect(notificationTarget(item({ entityType: "deliverable", entityId: "d1" }))).toBeNull();
    expect(
      notificationTarget(item({ entityType: "deliverable", entityId: "d1" }), new Map()),
    ).toBeNull();
  });

  it("não gera link para tipos desconhecidos ou sem entity_id", () => {
    expect(notificationTarget(item({ entityType: "comment", entityId: "c1" }))).toBeNull();
    expect(notificationTarget(item({ entityType: "action", entityId: null }))).toBeNull();
    expect(notificationTarget(item({ entityType: null, entityId: null }))).toBeNull();
  });
});

describe("formatNotificationTimestamp", () => {
  it("formata data/hora válida em PT-BR", () => {
    const formatted = formatNotificationTimestamp("2026-08-20T10:00:00.000Z");
    expect(formatted).toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });

  it("devolve string vazia para entrada inválida", () => {
    expect(formatNotificationTimestamp("not-a-date")).toBe("");
    expect(formatNotificationTimestamp("")).toBe("");
  });
});

describe("notificationTypeLabel", () => {
  it("rotula os tipos reais gerados pelos triggers do ciclo 2", () => {
    expect(notificationTypeLabel("action.assigned")).toBe("Ação atribuída");
    expect(notificationTypeLabel("deliverable.assigned")).toBe("Entregável atribuído");
    expect(notificationTypeLabel("comment.created")).toBe("Novo comentário");
  });

  it("usa rótulo genérico para tipos desconhecidos", () => {
    expect(notificationTypeLabel("system.announcement")).toBe("Notificação");
    expect(notificationTypeLabel("")).toBe("Notificação");
  });
});

describe("targets dos tipos gerados automaticamente", () => {
  it("action.assigned linka direto para a ação", () => {
    expect(
      notificationTarget(
        item({ notificationType: "action.assigned", entityType: "action", entityId: "a1" }),
      ),
    ).toEqual({ type: "action", actionId: "a1" });
  });

  it("deliverable.assigned linka para a ação pai via mapa resolvido", () => {
    expect(
      notificationTarget(
        item({
          notificationType: "deliverable.assigned",
          entityType: "deliverable",
          entityId: "d1",
        }),
        new Map([["d1", "a7"]]),
      ),
    ).toEqual({ type: "action", actionId: "a7" });
  });

  it("comment.created preserva entity_type action ou deliverable", () => {
    expect(
      notificationTarget(
        item({ notificationType: "comment.created", entityType: "action", entityId: "a2" }),
      ),
    ).toEqual({ type: "action", actionId: "a2" });
    expect(
      notificationTarget(
        item({ notificationType: "comment.created", entityType: "deliverable", entityId: "d2" }),
        new Map([["d2", "a3"]]),
      ),
    ).toEqual({ type: "action", actionId: "a3" });
  });
});
