import { describe, expect, it } from "vitest";

import { ClientFormSchema, canManageOperationalData, toClientFormInput } from "./clients";

describe("ClientFormSchema", () => {
  it("normaliza e converte campos opcionais vazios em null", () => {
    const parsed = ClientFormSchema.parse({
      name: "  Petro Offshore  ",
      code: "",
      contacts: [
        {
          email: "  ANA@EXAMPLE.COM ",
          phone: " +55 21 99999-0000 ",
          responsibleArea: " Operações ",
        },
      ],
    });

    expect(parsed).toEqual({
      name: "Petro Offshore",
      code: null,
      contacts: [
        {
          email: "ana@example.com",
          phone: "+55 21 99999-0000",
          responsibleArea: "Operações",
        },
      ],
    });
  });

  it("rejeita nome curto e e-mail inválido", () => {
    const parsed = ClientFormSchema.safeParse({
      name: "A",
      code: "",
      contacts: [{ email: "nao-e-email", phone: "", responsibleArea: "" }],
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const errors = parsed.error.flatten().fieldErrors;
      expect(errors.name).toBeDefined();
      expect(errors.contacts).toBeDefined();
    }
  });

  it("remove linhas totalmente vazias e exige e-mail quando há outros dados", () => {
    const empty = ClientFormSchema.parse({
      name: "Petro Offshore",
      code: "",
      contacts: [{ email: "", phone: "", responsibleArea: "" }],
    });
    expect(empty.contacts).toEqual([]);

    const invalid = ClientFormSchema.safeParse({
      name: "Petro Offshore",
      code: "",
      contacts: [{ email: "", phone: "+55 21 99999-0000", responsibleArea: "Operações" }],
    });
    expect(invalid.success).toBe(false);
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
        contacts: [],
        createdAt: "2026-08-09T00:00:00.000Z",
      }),
    ).toEqual({
      name: "Petro Offshore",
      code: "",
      contacts: [{ email: "", phone: "", responsibleArea: "" }],
    });
  });

  it("faz round-trip com o schema de validação", () => {
    const parsed = ClientFormSchema.parse(
      toClientFormInput({
        id: "c2",
        name: "Mar Azul",
        code: "MA-01",
        contacts: [
          {
            id: "bf745e58-b8a0-42dd-aa11-15f64cc19be7",
            email: "ana@example.com",
            phone: "+55 21 99999-0000",
            responsibleArea: "Operações",
          },
        ],
        createdAt: "2026-08-09T00:00:00.000Z",
      }),
    );
    expect(parsed.code).toBe("MA-01");
    expect(parsed.contacts[0]?.email).toBe("ana@example.com");
    expect(parsed.contacts[0]?.responsibleArea).toBe("Operações");
  });
});
