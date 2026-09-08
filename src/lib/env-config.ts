export type RuntimeEnvironmentInput = {
  VITE_APP_ENV?: string;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
};

const DEV_SUPABASE_URL = "https://lyxonmqsldtsixdhcaww.supabase.co";
const DEV_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_9x93Tl3V-cb-OuhfxzBP5g_TeEzNd-8";

/**
 * Apply public Development defaults without ever crossing environment
 * boundaries. Validation remains in env.ts, after this resolution step.
 */
export function resolveEnvironment(input: RuntimeEnvironmentInput) {
  const appEnv = input.VITE_APP_ENV || "development";
  const useDevelopmentDefaults = appEnv === "development";

  return {
    VITE_APP_ENV: appEnv,
    VITE_SUPABASE_URL:
      input.VITE_SUPABASE_URL || (useDevelopmentDefaults ? DEV_SUPABASE_URL : undefined),
    VITE_SUPABASE_PUBLISHABLE_KEY:
      input.VITE_SUPABASE_PUBLISHABLE_KEY ||
      (useDevelopmentDefaults ? DEV_SUPABASE_PUBLISHABLE_KEY : undefined),
  };
}
