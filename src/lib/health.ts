import { env } from "./env";

const HEALTH_TIMEOUT_MS = 4_000;

export interface DependencyCheck {
  status: "ok" | "error";
  latency_ms: number;
}

export interface HealthPayload {
  status: "ok" | "degraded";
  service: "dp-suite";
  environment: string;
  checked_at: string;
  checks: {
    app: { status: "ok" };
    supabase_auth: DependencyCheck;
  };
}

interface HealthConfig {
  appEnv: string;
  supabaseUrl?: string;
  supabasePublishableKey?: string;
}

function elapsedMilliseconds(startedAt: number): number {
  return Math.max(0, Math.round(performance.now() - startedAt));
}

export async function checkSupabaseAuth(
  config: Pick<HealthConfig, "supabaseUrl" | "supabasePublishableKey">,
  fetchImpl: typeof fetch = fetch,
): Promise<DependencyCheck> {
  const startedAt = performance.now();

  if (!config.supabaseUrl || !config.supabasePublishableKey) {
    return { status: "error", latency_ms: elapsedMilliseconds(startedAt) };
  }

  try {
    const response = await fetchImpl(`${config.supabaseUrl}/auth/v1/health`, {
      headers: { apikey: config.supabasePublishableKey },
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });

    return {
      status: response.ok ? "ok" : "error",
      latency_ms: elapsedMilliseconds(startedAt),
    };
  } catch {
    return { status: "error", latency_ms: elapsedMilliseconds(startedAt) };
  }
}

export async function getHealthPayload(
  config: HealthConfig = {
    appEnv: env.appEnv,
    supabaseUrl: env.supabaseUrl,
    supabasePublishableKey: env.supabasePublishableKey,
  },
  fetchImpl: typeof fetch = fetch,
): Promise<HealthPayload> {
  const supabaseAuth =
    config.supabaseUrl && config.supabasePublishableKey
      ? await checkSupabaseAuth(config, fetchImpl)
      : { status: "error" as const, latency_ms: 0 };

  return {
    status: supabaseAuth.status === "ok" ? "ok" : "degraded",
    service: "dp-suite",
    environment: config.appEnv,
    checked_at: new Date().toISOString(),
    checks: {
      app: { status: "ok" },
      supabase_auth: supabaseAuth,
    },
  };
}
