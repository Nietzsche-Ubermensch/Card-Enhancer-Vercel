import { createFileRoute } from "@tanstack/react-router";
import { runConnectorProbe } from "@/lib/connectors";

export const Route = createFileRoute("/api/connectors")({
  server: {
    handlers: {
      GET: async () => {
        const probe = await runConnectorProbe();
        return Response.json({ ok: true, ...probe });
      },
    },
  },
});
