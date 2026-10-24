import { describe, expect, it } from "vitest";

import { DocumentCompanyFormSchema, mapDocumentCompany } from "./document-companies";

describe("DocumentCompanyFormSchema", () => {
  it("normaliza o nome da empresa", () => {
    expect(DocumentCompanyFormSchema.parse({ name: "  Empresa Offshore  " })).toEqual({
      name: "Empresa Offshore",
    });
  });

  it("rejeita nomes vazios ou acima do limite", () => {
    expect(DocumentCompanyFormSchema.safeParse({ name: " " }).success).toBe(false);
    expect(DocumentCompanyFormSchema.safeParse({ name: "A".repeat(161) }).success).toBe(false);
  });
});

describe("mapDocumentCompany", () => {
  it("converte a linha do banco para o modelo da interface", () => {
    expect(
      mapDocumentCompany({
        id: "company-1",
        name: "Empresa Offshore",
        created_at: "2026-10-24T18:00:00.000Z",
      }),
    ).toEqual({
      id: "company-1",
      name: "Empresa Offshore",
      createdAt: "2026-10-24T18:00:00.000Z",
    });
  });
});
