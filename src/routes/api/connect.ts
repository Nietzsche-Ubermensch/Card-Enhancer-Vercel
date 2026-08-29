import { createFileRoute } from "@tanstack/react-router";
import { probeConnectEntrypoints } from "@/lib/connect";

export const Route = createFileRoute("/api/connect")({
  server: {
    handlers: {
      GET: async () => {
        const probe = await probeConnectEntrypoints();
        return Response.json(probe);
      },
    },
  },
});
