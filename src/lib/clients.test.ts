import { describe, expect, it } from "vitest";

import { ClientFormSchema, canManageOperationalData, toClientFormInput } from "./clients";

describe("ClientFormSchema", () => {
  it("normaliza e converte campos opcionais vazios em null", () => {
    const parsed = ClientFormSchema.parse({
      name: "  Petro Offshore  ",
      code: "",
      contactName: " Ana Souza ",
      contactEmail: "  ANA@EXAMPLE.COM ",
      contactPhone: "",
      contractManagement: " Operações Offshore ",
      contractManager: " Bruno Azevedo ",
    });

    expect(parsed).toEqual({
      name: "Petro Offshore",
      code: null,
      contactName: "Ana Souza",
      contactEmail: "ana@example.com",
      contactPhone: null,
      contractManagement: "Operações Offshore",
      contractManager: "Bruno Azevedo",
    });
  });

  it("rejeita nome curto e e-mail inválido", () => {
    const parsed = ClientFormSchema.safeParse({
      name: "A",
      code: "",
      contactName: "",
      contactEmail: "nao-e-email",
      contactPhone: "",
      contractManagement: "",
      contractManager: "",
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

describe("toClientFormInput", () => {
  it("converte nulos em strings vazias para o formulário", () => {
    expect(
      toClientFormInput({
        id: "c1",
        name: "Petro Offshore",
        code: null,
        contactName: null,
        contactEmail: null,
        contactPhone: null,
        contractManagement: null,
        contractManager: null,
        createdAt: "2026-08-09T00:00:00.000Z",
      }),
    ).toEqual({
      name: "Petro Offshore",
      code: "",
      contactName: "",
      contactEmail: "",
      contactPhone: "",
      contractManagement: "",
      contractManager: "",
    });
  });

  it("faz round-trip com o schema de validação", () => {
    const parsed = ClientFormSchema.parse(
      toClientFormInput({
        id: "c2",
        name: "Mar Azul",
        code: "MA-01",
        contactName: "Ana",
        contactEmail: "ana@example.com",
        contactPhone: "+55 21 99999-0000",
        contractManagement: "Gerência de Operações",
        contractManager: "Carlos Lima",
        createdAt: "2026-08-09T00:00:00.000Z",
      }),
    );
    expect(parsed.code).toBe("MA-01");
    expect(parsed.contactEmail).toBe("ana@example.com");
  });
});
