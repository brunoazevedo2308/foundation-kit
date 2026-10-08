import { createFileRoute } from "@tanstack/react-router";

import { getHealthPayload } from "@/lib/health";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        const payload = await getHealthPayload();

        return Response.json(payload, {
          status: payload.status === "ok" ? 200 : 503,
          headers: {
            "Cache-Control": "no-store, max-age=0",
            "X-Content-Type-Options": "nosniff",
          },
        });
      },
    },
  },
});
