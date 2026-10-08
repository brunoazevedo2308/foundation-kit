import { describe, expect, it, vi } from "vitest";

import { checkSupabaseAuth, getHealthPayload } from "./health";

const config = {
  appEnv: "production",
  supabaseUrl: "https://example.supabase.co",
  supabasePublishableKey: "publishable-key",
};

describe("production health check", () => {
  it("reports ok when Supabase Auth responds successfully", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status: 200 }));

    const payload = await getHealthPayload(config, fetchImpl);

    expect(payload.status).toBe("ok");
    expect(payload.environment).toBe("production");
    expect(payload.checks.app.status).toBe("ok");
    expect(payload.checks.supabase_auth.status).toBe("ok");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://example.supabase.co/auth/v1/health",
      expect.objectContaining({
        headers: { apikey: "publishable-key" },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("reports degraded without exposing upstream error details", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("internal error with sensitive details", { status: 503 }));

    const payload = await getHealthPayload(config, fetchImpl);

    expect(payload.status).toBe("degraded");
    expect(payload.checks.supabase_auth.status).toBe("error");
    expect(JSON.stringify(payload)).not.toContain("sensitive details");
  });

  it("handles network failures as a dependency error", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new Error("network down"));

    await expect(checkSupabaseAuth(config, fetchImpl)).resolves.toMatchObject({ status: "error" });
  });

  it("does not call the network when configuration is absent", async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(checkSupabaseAuth({}, fetchImpl)).resolves.toMatchObject({ status: "error" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
