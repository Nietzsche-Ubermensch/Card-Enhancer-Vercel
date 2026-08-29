import { createFileRoute } from "@tanstack/react-router";
import { AI_PROVIDER_META, ACTIVE_AI_PROVIDER } from "@/lib/ai/provider";
import { providerStatus } from "@/lib/ai/keys";

export const Route = createFileRoute("/api/ai/status")({
  server: {
    handlers: {
      GET: async () => {
        const status = providerStatus();
        return Response.json({
          ok: true,
          available: status.available,
          provider: status.active,
          models: AI_PROVIDER_META[ACTIVE_AI_PROVIDER],
          keys: status.keys,
          credentials: status.credentials,
        });
      },
    },
  },
});
