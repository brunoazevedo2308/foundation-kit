import { describe, expect, it } from "vitest";
import { resolveEnvironment } from "./env-config";

describe("resolveEnvironment", () => {
  it("uses the development defaults only in Development", () => {
    const result = resolveEnvironment({ VITE_APP_ENV: "development" });

    expect(result.VITE_APP_ENV).toBe("development");
    expect(result.VITE_SUPABASE_URL).toBe("https://lyxonmqsldtsixdhcaww.supabase.co");
    expect(result.VITE_SUPABASE_PUBLISHABLE_KEY).toMatch(/^sb_publishable_/);
  });

  it("never falls back to Development from Staging", () => {
    const result = resolveEnvironment({ VITE_APP_ENV: "staging" });

    expect(result).toEqual({
      VITE_APP_ENV: "staging",
      VITE_SUPABASE_URL: undefined,
      VITE_SUPABASE_PUBLISHABLE_KEY: undefined,
    });
  });

  it("keeps the explicit Staging configuration", () => {
    const result = resolveEnvironment({
      VITE_APP_ENV: "staging",
      VITE_SUPABASE_URL: "https://staging-project.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_staging",
    });

    expect(result).toEqual({
      VITE_APP_ENV: "staging",
      VITE_SUPABASE_URL: "https://staging-project.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_staging",
    });
  });

  it("does not add defaults to an unknown environment", () => {
    expect(resolveEnvironment({ VITE_APP_ENV: "preview" })).toEqual({
      VITE_APP_ENV: "preview",
      VITE_SUPABASE_URL: undefined,
      VITE_SUPABASE_PUBLISHABLE_KEY: undefined,
    });
  });
});
