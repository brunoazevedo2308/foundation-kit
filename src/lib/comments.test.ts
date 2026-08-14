import { describe, expect, it } from "vitest";

import {
  CommentFormSchema,
  canDeleteComment,
  formatCommentTimestamp,
  mapComment,
  type CommentListItem,
} from "./comments";

function item(over: Partial<CommentListItem> = {}): CommentListItem {
  return {
    id: "c1",
    actionId: "a1",
    deliverableId: null,
    body: "texto",
    authorUserId: "u1",
    authorName: "Ana",
    createdAt: "2026-01-01T10:00:00.000Z",
    updatedAt: "2026-01-01T10:00:00.000Z",
    ...over,
  };
}

describe("mapComment", () => {
  it("maps a row with the embedded author profile", () => {
    expect(
      mapComment({
        id: "c1",
        action_id: "a1",
        deliverable_id: null,
        body: "ok",
        author_user_id: "u1",
        created_at: "2026-01-01T10:00:00.000Z",
        updated_at: "2026-01-01T10:00:00.000Z",
        profiles: { full_name: "Ana" },
      }),
    ).toMatchObject({ id: "c1", actionId: "a1", authorName: "Ana" });
  });

  it("tolerates a missing author profile", () => {
    expect(
      mapComment({
        id: "c2",
        action_id: null,
        deliverable_id: "d1",
        body: "ok",
        author_user_id: "u1",
        created_at: "x",
        updated_at: "x",
      }).authorName,
    ).toBeNull();
  });
});

describe("CommentFormSchema", () => {
  it("rejects empty or oversized bodies", () => {
    expect(CommentFormSchema.safeParse({ body: " " }).success).toBe(false);
    expect(CommentFormSchema.safeParse({ body: "a".repeat(2001) }).success).toBe(false);
  });

  it("trims a valid body", () => {
    expect(CommentFormSchema.parse({ body: "  olá  " }).body).toBe("olá");
  });
});

describe("canDeleteComment", () => {
  it("allows the author", () => {
    expect(canDeleteComment(item(), "u1", "member")).toBe(true);
  });

  it("allows administrators", () => {
    expect(canDeleteComment(item(), "u2", "organization_admin")).toBe(true);
    expect(canDeleteComment(item(), "u2", "system_admin")).toBe(true);
  });

  it("blocks other members", () => {
    expect(canDeleteComment(item(), "u2", "member")).toBe(false);
  });
});

describe("formatCommentTimestamp", () => {
  it("returns an empty string for invalid input", () => {
    expect(formatCommentTimestamp("not-a-date")).toBe("");
  });

  it("formats a valid ISO timestamp", () => {
    expect(formatCommentTimestamp("2026-01-01T10:00:00.000Z")).not.toBe("");
  });
});
