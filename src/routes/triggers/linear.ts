import { createFileRoute } from "@tanstack/react-router";
import { connectTriggerVerified, LINEAR_CONNECT_ID, LINEAR_CONNECT_TRIGGER_PATH, LINEAR_CONNECT_TRIGGER_URL } from "@/lib/connect";
import { ingestLinearWebhook, listLinearDeliveries } from "@/lib/linear-webhook";

export const Route = createFileRoute("/triggers/linear")({
  server: {
    handlers: {
      GET: async () => {
        return Response.json({
          ok: true,
          connector: LINEAR_CONNECT_ID,
          path: LINEAR_CONNECT_TRIGGER_PATH,
          trigger: LINEAR_CONNECT_TRIGGER_URL,
          verifier: "vercel-oidc",
          events: listLinearDeliveries(),
        });
      },
      POST: async ({ request }) => {
        const rawBody = await request.text();
        const auth = request.headers.get("authorization");
        if (auth) {
          const verified = await connectTriggerVerified(request, rawBody);
          if (!verified) {
            return Response.json({ ok: false, error: "invalid Connect OIDC" }, { status: 401 });
          }
        }
        const result = ingestLinearWebhook({
          rawBody,
          signature: request.headers.get("linear-signature") ?? request.headers.get("Linear-Signature"),
          eventHeader: request.headers.get("linear-event") ?? request.headers.get("Linear-Event"),
          timestampHeader: request.headers.get("linear-timestamp") ?? request.headers.get("Linear-Timestamp"),
          delivery: request.headers.get("linear-delivery") ?? request.headers.get("Linear-Delivery"),
          userAgent: request.headers.get("user-agent"),
          secret: null,
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
