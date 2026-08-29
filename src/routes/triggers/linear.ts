import { createFileRoute } from "@tanstack/react-router";
import {
  LINEAR_CONNECT_ID,
  LINEAR_CONNECT_TRIGGER_PATH,
  LINEAR_CONNECT_TRIGGER_URL,
} from "@/lib/linear-connect";
import { ingestLinearWebhook, listLinearDeliveries, webhookSecret } from "@/lib/linear-webhook";

export const Route = createFileRoute("/triggers/linear")({
  server: {
    handlers: {
      GET: async () => {
        return Response.json({
          ok: true,
          connector: LINEAR_CONNECT_ID,
          path: LINEAR_CONNECT_TRIGGER_PATH,
          trigger: LINEAR_CONNECT_TRIGGER_URL,
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
