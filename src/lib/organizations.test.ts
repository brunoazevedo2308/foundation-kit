import { describe, expect, it } from "vitest";

import {
  CreateOrganizationSchema,
  mapCreateOrganizationError,
} from "./organizations";

const validInput = {
  legalName: "Nobru Marine Solutions LTDA",
  displayName: "Nobru Marine",
  countryCode: "br",
  primaryEmail: "Ops@Nobru.Example",
  status: "active" as const,
  language: "pt-BR" as const,
  timezone: "America/Sao_Paulo",
  dateFormat: "DD/MM/YYYY" as const,
};

describe("CreateOrganizationSchema", () => {
  it("accepts a well-formed payload and normalizes country/email", () => {
    const parsed = CreateOrganizationSchema.parse(validInput);
    expect(parsed.countryCode).toBe("BR");
    expect(parsed.primaryEmail).toBe("ops@nobru.example");
  });

  it("rejects invalid country_code", () => {
    const result = CreateOrganizationSchema.safeParse({ ...validInput, countryCode: "BRA" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email", () => {
    const result = CreateOrganizationSchema.safeParse({ ...validInput, primaryEmail: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("rejects blank legal_name / display_name", () => {
    expect(CreateOrganizationSchema.safeParse({ ...validInput, legalName: "" }).success).toBe(false);
    expect(CreateOrganizationSchema.safeParse({ ...validInput, displayName: " " }).success).toBe(false);
  });

  it("rejects unknown enum values", () => {
    expect(
      CreateOrganizationSchema.safeParse({ ...validInput, status: "suspended" as never }).success,
    ).toBe(false);
    expect(
      CreateOrganizationSchema.safeParse({ ...validInput, language: "fr-FR" as never }).success,
    ).toBe(false);
    expect(
      CreateOrganizationSchema.safeParse({ ...validInput, dateFormat: "DD.MM.YYYY" as never })
        .success,
    ).toBe(false);
  });
});

describe("mapCreateOrganizationError", () => {
  it("maps 42501 to denied", () => {
    const err = mapCreateOrganizationError({ code: "42501", message: "..." });
    expect(err.kind).toBe("denied");
  });

  it("maps 'System Admin' text to denied even without code", () => {
    const err = mapCreateOrganizationError({
      message: "Only an active System Admin can create an organization",
    });
    expect(err.kind).toBe("denied");
  });

  it("maps 23505 / duplicate to conflict", () => {
    expect(mapCreateOrganizationError({ code: "23505", message: "duplicate key" }).kind).toBe(
      "conflict",
    );
    expect(
      mapCreateOrganizationError({ message: "duplicate value violates unique constraint" }).kind,
    ).toBe("conflict");
  });

  it("maps 23514 / 22P02 to validation", () => {
    expect(mapCreateOrganizationError({ code: "23514", message: "check" }).kind).toBe("validation");
    expect(mapCreateOrganizationError({ code: "22P02", message: "enum" }).kind).toBe("validation");
  });

  it("falls back to unknown", () => {
    expect(mapCreateOrganizationError({ code: "08006", message: "network" }).kind).toBe("unknown");
    expect(mapCreateOrganizationError({}).kind).toBe("unknown");
  });
});
