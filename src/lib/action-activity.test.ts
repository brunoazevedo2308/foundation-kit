import { describe, expect, it } from "vitest";

import {
  actionActivityLabel,
  formatActionActivityTimestamp,
  mapActionActivity,
} from "./action-activity";

describe("action activity helpers", () => {
  it("maps an activity row and its actor", () => {
    expect(
      mapActionActivity({
        id: "event-1",
        action_id: "action-1",
        actor_user_id: "user-1",
        event_type: "evidence.created",
        summary: "Evidência enviada",
        metadata: {},
        created_at: "2026-10-22T10:00:00.000Z",
        profiles: { full_name: "Suporte" },
      }),
    ).toMatchObject({
      id: "event-1",
      actionId: "action-1",
      actorName: "Suporte",
      eventType: "evidence.created",
    });
  });

  it("provides friendly and fallback event labels", () => {
    expect(actionActivityLabel("comment.created")).toBe("Comentário adicionado");
    expect(actionActivityLabel("future.event")).toBe("Atualização da ação");
  });

  it("returns an empty timestamp for invalid input", () => {
    expect(formatActionActivityTimestamp("not-a-date")).toBe("");
  });
});
