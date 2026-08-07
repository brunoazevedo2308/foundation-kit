import { describe, expect, it } from "vitest";

import { VesselFormSchema } from "./vessels";

describe("VesselFormSchema", () => {
  it("normaliza campos e mantém vínculo opcional nulo", () => {
    const parsed = VesselFormSchema.parse({
      name: "  Skandi DP  ",
      imoNumber: " 9241061 ",
      vesselType: " PSV ",
      dpClass: " DP2 ",
      status: "active",
      clientId: "",
    });

    expect(parsed).toEqual({
      name: "Skandi DP",
      imoNumber: "9241061",
      vesselType: "PSV",
      dpClass: "DP2",
      status: "active",
      clientId: null,
    });
  });

  it("rejeita IMO com formato inválido", () => {
    const parsed = VesselFormSchema.safeParse({
      name: "Skandi DP",
      imoNumber: "12345",
      vesselType: "",
      dpClass: "",
      status: "active",
      clientId: "",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.imoNumber).toBeDefined();
    }
  });

  it("rejeita status desconhecido e clientId não-uuid", () => {
    expect(
      VesselFormSchema.safeParse({
        name: "Skandi DP",
        imoNumber: "",
        vesselType: "",
        dpClass: "",
        status: "scrapped",
        clientId: "",
      }).success,
    ).toBe(false);

    expect(
      VesselFormSchema.safeParse({
        name: "Skandi DP",
        imoNumber: "",
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
      imoNumber: "",
      vesselType: "",
      dpClass: "",
      status: "inactive",
      clientId: "0f10f14c-a74d-41c2-81c3-c67ac69e9f12",
    });
    expect(parsed.clientId).toBe("0f10f14c-a74d-41c2-81c3-c67ac69e9f12");
    expect(parsed.status).toBe("inactive");
  });
});
