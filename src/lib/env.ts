import { z } from "zod";

/**
 * Environment configuration for DP Suite.
 *
 * Values are read from Vite's `import.meta.env` and validated with Zod.
 * Do NOT read or expose service_role or any backend-only secret here — this
 * module runs in the browser bundle.
 */

const AppEnvSchema = z.enum(["development", "staging", "production"]);
export type AppEnv = z.infer<typeof AppEnvSchema>;

const EnvSchema = z.object({
  VITE_APP_ENV: AppEnvSchema.default("development"),
  VITE_SUPABASE_URL: z
    .string()
    .url()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  VITE_SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .min(1)
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

const raw = {
  VITE_APP_ENV: import.meta.env.VITE_APP_ENV,
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
};

const parsed = EnvSchema.safeParse(raw);

if (!parsed.success) {
  // Fail fast with a readable error — never log the values themselves.
  const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  throw new Error(`Invalid environment configuration: ${issues}`);
}

const data = parsed.data;

export const env = {
  appEnv: data.VITE_APP_ENV,
  supabaseUrl: data.VITE_SUPABASE_URL,
  supabasePublishableKey: data.VITE_SUPABASE_PUBLISHABLE_KEY,
} as const;

/** True when both Supabase URL and publishable key are configured. */
export const isSupabaseConfigured: boolean = Boolean(env.supabaseUrl && env.supabasePublishableKey);
