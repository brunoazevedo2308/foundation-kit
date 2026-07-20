import { defineMcp } from "@lovable.dev/mcp-js";

import echoTool from "./tools/echo";
import statusTool from "./tools/status";

/**
 * DP Suite MCP server.
 *
 * Public (no auth) — the foundation stage exposes only read-only tools on
 * intentionally public data (deployment status, connectivity echo). No user
 * data, no database access. When authenticated features land, migrate this
 * definition to `auth.oauth.issuer(...)` before adding tools that read or
 * write per-user data.
 */
export default defineMcp({
  name: "dp-suite-mcp",
  title: "DP Suite MCP",
  version: "0.1.0",
  instructions:
    "Ferramentas do DP Suite (governança de Dynamic Positioning). Nesta fase de fundação, use `get_status` para inspecionar o estado do deploy e `echo` para verificar conectividade.",
  tools: [statusTool, echoTool],
});
