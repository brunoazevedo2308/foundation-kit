import { describe, expect, it } from "vitest";

import {
  mapPrivacyRequest,
  PrivacyRequestSchema,
  privacyRequestStatusLabel,
  privacyRequestTypeLabel,
} from "./privacy-requests";

describe("PrivacyRequestSchema", () => {
  it("normaliza uma solicitação válida", () => {
    expect(
      PrivacyRequestSchema.parse({ requestType: "access", details: "  Quero meus dados.  " }),
    ).toEqual({ requestType: "access", details: "Quero meus dados." });
  });

  it("rejeita tipo desconhecido e descrição curta", () => {
    expect(
      PrivacyRequestSchema.safeParse({ requestType: "export", details: "curta" }).success,
    ).toBe(false);
  });
});

describe("privacy request mapping", () => {
  it("mapeia colunas e apresenta rótulos", () => {
    const mapped = mapPrivacyRequest({
      id: "request-1",
      requester_user_id: "user-1",
      request_type: "correction",
      details: "Corrigir meu nome cadastrado.",
      status: "in_review",
      response_summary: null,
      resolved_at: null,
      created_at: "2026-10-09T12:00:00Z",
      updated_at: "2026-10-09T12:00:00Z",
    });
    expect(mapped.requesterUserId).toBe("user-1");
    expect(privacyRequestTypeLabel(mapped.requestType)).toBe("Correção de dados");
    expect(privacyRequestStatusLabel(mapped.status)).toBe("Em análise");
  });
});
