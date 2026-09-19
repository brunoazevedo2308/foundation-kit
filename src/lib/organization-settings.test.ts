import { describe, expect, it } from "vitest";

import { OrganizationSettingsSchema } from "./organization-settings";

const valid = {
  name: "Callyvon",
  legalName: "Callyvon",
  primaryEmail: "ADMIN@CALLYVON.COM",
  defaultLanguage: "pt-BR" as const,
  timezone: "America/Sao_Paulo",
  dateFormat: "DD/MM/YYYY" as const,
};

describe("OrganizationSettingsSchema", () => {
  it("normaliza o e-mail e aceita preferências válidas", () => {
    expect(OrganizationSettingsSchema.parse(valid).primaryEmail).toBe("admin@callyvon.com");
  });

  it("rejeita e-mail e enums inválidos", () => {
    expect(
      OrganizationSettingsSchema.safeParse({ ...valid, primaryEmail: "inválido" }).success,
    ).toBe(false);
    expect(
      OrganizationSettingsSchema.safeParse({ ...valid, dateFormat: "DD.MM.YYYY" }).success,
    ).toBe(false);
  });
});
