import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

/**
 * Simple connectivity check — echoes the caller's text back verbatim.
 */
export default defineTool({
  name: "echo",
  title: "Echo",
  description: "Echo the provided text back to the caller. Useful to verify MCP connectivity.",
  inputSchema: {
    text: z.string().min(1).describe("Text to echo back."),
  },
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: ({ text }) => ({
    content: [{ type: "text", text }],
  }),
});
