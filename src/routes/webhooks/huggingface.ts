import { createFileRoute } from "@tanstack/react-router";
import {
  hfWebhookContract,
  ingestHfWebhook,
  listHfDeliveries,
  notifyLinearFromHf,
} from "@/lib/huggingface-webhook";

export const Route = createFileRoute("/webhooks/huggingface")({
  server: {
    handlers: {
      GET: async () => {
        return Response.json({
          ok: true,
          contract: hfWebhookContract(),
          events: listHfDeliveries(),
        });
      },
      POST: async ({ request }) => {
        const rawBody = await request.text();
        const result = ingestHfWebhook({
          rawBody,
          secretHeader: request.headers.get("x-webhook-secret"),
        });
        if (!result.ok) {
          return Response.json({ ok: false, error: result.error }, { status: result.status });
        }
        const linear = await notifyLinearFromHf({
          id: result.id,
          scope: result.scope,
          action: result.action,
          repo: result.repo,
          secret: result.secret,
        });
        return Response.json(
          {
            ok: true,
            id: result.id,
            secret: result.secret,
            scope: result.scope,
            action: result.action,
            repo: result.repo,
            linear,
          },
          { status: 200 },
        );
      },
    },
  },
});
