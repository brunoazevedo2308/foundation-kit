import { describe, expect, it } from "vitest";

import { InviteUserSchema } from "./users";

describe("InviteUserSchema", () => {
  it("normalizes valid invitation data", () => {
    const parsed = InviteUserSchema.parse({
      fullName: "  Maria da Silva  ",
      email: "  MARIA@EXAMPLE.COM ",
      organizationId: "0f10f14c-a74d-41c2-81c3-c67ac69e9f12",
      role: "member",
    });

    expect(parsed).toEqual({
      fullName: "Maria da Silva",
      email: "maria@example.com",
      organizationId: "0f10f14c-a74d-41c2-81c3-c67ac69e9f12",
      role: "member",
    });
  });

  it("rejects invalid required fields", () => {
    const parsed = InviteUserSchema.safeParse({
      fullName: "A",
      email: "not-an-email",
      organizationId: "",
      role: "member",
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.fullName).toBeDefined();
      expect(parsed.error.flatten().fieldErrors.email).toBeDefined();
      expect(parsed.error.flatten().fieldErrors.organizationId).toBeDefined();
    }
  });

  it("rejects unknown roles", () => {
    expect(
      InviteUserSchema.safeParse({
        fullName: "Maria da Silva",
        email: "maria@example.com",
        organizationId: "0f10f14c-a74d-41c2-81c3-c67ac69e9f12",
        role: "owner",
      }).success,
    ).toBe(false);
  });
});
