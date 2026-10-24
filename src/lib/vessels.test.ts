import { describe, expect, it } from "vitest";

import { VesselFormSchema, toVesselFormInput } from "./vessels";

describe("VesselFormSchema", () => {
  it("normaliza campos e mantém vínculo opcional nulo", () => {
    const parsed = VesselFormSchema.parse({
      name: "  Skandi DP  ",
      vesselType: " PSV ",
      dpClass: " DP2 ",
      companyName: " Atino Offshore ",
      contractManagement: " Operações Offshore ",
      contractManager: " Bruno Azevedo ",
      status: "active",
      clientId: "",
    });

    expect(parsed).toEqual({
      name: "Skandi DP",
      vesselType: "PSV",
      dpClass: "DP2",
      companyName: "Atino Offshore",
      contractManagement: "Operações Offshore",
      contractManager: "Bruno Azevedo",
      status: "active",
      clientId: null,
    });
  });

  it("rejeita status desconhecido e clientId não-uuid", () => {
    expect(
      VesselFormSchema.safeParse({
        name: "Skandi DP",
        vesselType: "",
        dpClass: "",
        status: "scrapped",
        clientId: "",
      }).success,
    ).toBe(false);

    expect(
      VesselFormSchema.safeParse({
        name: "Skandi DP",
        vesselType: "",
        dpClass: "",
        status: "active",
        clientId: "nao-uuid",
      }).success,
    ).toBe(false);
  });

  it("aceita vínculo com cliente válido", () => {
    const parsed = VesselFormSchema.parse({
      name: "Skandi DP",
      vesselType: "",
      dpClass: "",
      status: "inactive",
      clientId: "0f10f14c-a74d-41c2-81c3-c67ac69e9f12",
    });
    expect(parsed.clientId).toBe("0f10f14c-a74d-41c2-81c3-c67ac69e9f12");
    expect(parsed.status).toBe("inactive");
  });
});

describe("toVesselFormInput", () => {
  it("converte nulos em strings vazias e preserva status", () => {
    expect(
      toVesselFormInput({
        id: "v1",
        name: "Skandi DP",
        vesselType: null,
        dpClass: null,
        companyName: null,
        contractManagement: null,
        contractManager: null,
        status: "inactive",
        clientId: null,
        clientName: null,
        keyDpPersonnel: [],
        createdAt: "2026-08-09T00:00:00.000Z",
      }),
    ).toEqual({
      name: "Skandi DP",
      vesselType: "",
      dpClass: "",
      companyName: "",
      contractManagement: "",
      contractManager: "",
      status: "inactive",
      clientId: "",
    });
  });

  it("faz round-trip com o schema de validação", () => {
    const parsed = VesselFormSchema.parse(
      toVesselFormInput({
        id: "v2",
        name: "Skandi DP",
        vesselType: "PSV",
        dpClass: "DP2",
        companyName: "Atino Offshore",
        contractManagement: "Gerência de Operações",
        contractManager: "Carlos Lima",
        status: "active",
        clientId: "0f10f14c-a74d-41c2-81c3-c67ac69e9f12",
        clientName: "Mar Azul",
        keyDpPersonnel: [{ userId: "86cd7575-679d-4df5-a8dc-0111776239ab", fullName: "Ana DPO" }],
        createdAt: "2026-08-09T00:00:00.000Z",
      }),
    );
    expect(parsed.clientId).toBe("0f10f14c-a74d-41c2-81c3-c67ac69e9f12");
  });
});
