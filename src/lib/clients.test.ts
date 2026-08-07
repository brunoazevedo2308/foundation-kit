import { describe, expect, it } from "vitest";

import { ClientFormSchema, canManageOperationalData } from "./clients";

describe("ClientFormSchema", () => {
  it("normaliza e converte campos opcionais vazios em null", () => {
    const parsed = ClientFormSchema.parse({
      name: "  Petro Offshore  ",
      code: "",
      contactName: " Ana Souza ",
      contactEmail: "  ANA@EXAMPLE.COM ",
      contactPhone: "",
    });

    expect(parsed).toEqual({
      name: "Petro Offshore",
      code: null,
      contactName: "Ana Souza",
      contactEmail: "ana@example.com",
      contactPhone: null,
    });
  });

  it("rejeita nome curto e e-mail inválido", () => {
    const parsed = ClientFormSchema.safeParse({
      name: "A",
      code: "",
      contactName: "",
      contactEmail: "nao-e-email",
      contactPhone: "",
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const errors = parsed.error.flatten().fieldErrors;
      expect(errors.name).toBeDefined();
      expect(errors.contactEmail).toBeDefined();
    }
  });
});

describe("canManageOperationalData", () => {
  it("autoriza apenas papéis administrativos", () => {
    expect(canManageOperationalData("system_admin")).toBe(true);
    expect(canManageOperationalData("organization_admin")).toBe(true);
    expect(canManageOperationalData("member")).toBe(false);
  });
});
