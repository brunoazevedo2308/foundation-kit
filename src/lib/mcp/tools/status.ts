import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { env, isSupabaseConfigured } from "@/lib/env";

/**
 * Reports the DP Suite foundation status: current environment and whether
 * the backend (Lovable Cloud / Supabase) is wired up. Read-only, no user
 * data — safe to expose on a public MCP server.
 */
export default defineTool({
  name: "get_status",
  title: "Get DP Suite status",
  description:
    "Return the DP Suite deployment status: app environment (development/staging/production) and whether the backend is configured.",
  inputSchema: {},
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: () => {
    const payload = {
      app: "DP Suite",
      env: env.appEnv,
      backend: isSupabaseConfigured ? "configured" : "pending",
      stage: "foundation",
    };
    return {
      content: [{ type: "text", text: JSON.stringify(payload) }],
      structuredContent: payload,
    };
  },
});
