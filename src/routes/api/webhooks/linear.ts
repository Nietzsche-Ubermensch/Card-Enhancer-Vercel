import { createFileRoute } from "@tanstack/react-router";
import {
  ingestLinearWebhook,
  listLinearDeliveries,
  webhookContract,
  webhookSecret,
} from "@/lib/linear-webhook";

export const Route = createFileRoute("/api/webhooks/linear")({
  server: {
    handlers: {
      GET: async () => {
        return Response.json({
          ok: true,
          contract: webhookContract(),
          events: listLinearDeliveries(),
        });
      },
      POST: async ({ request }) => {
        const rawBody = await request.text();
        const result = ingestLinearWebhook({
          rawBody,
          signature: request.headers.get("linear-signature") ?? request.headers.get("Linear-Signature"),
          eventHeader: request.headers.get("linear-event") ?? request.headers.get("Linear-Event"),
          timestampHeader: request.headers.get("linear-timestamp") ?? request.headers.get("Linear-Timestamp"),
          delivery: request.headers.get("linear-delivery") ?? request.headers.get("Linear-Delivery"),
          userAgent: request.headers.get("user-agent"),
          secret: webhookSecret(),
          source: "linear",
        });
        if (!result.ok) {
          return Response.json({ ok: false, error: result.error }, { status: result.status });
        }
        return Response.json({ ok: true, id: result.event.id }, { status: 200 });
      },
    },
  },
});
