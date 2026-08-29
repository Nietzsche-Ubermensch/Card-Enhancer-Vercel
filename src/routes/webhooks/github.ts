import { createFileRoute } from "@tanstack/react-router";
import { githubWebhookContract, ingestGitHubWebhook, listGitHubDeliveries } from "@/lib/github-webhook";

export const Route = createFileRoute("/webhooks/github")({
  server: {
    handlers: {
      GET: async () => {
        return Response.json({
          ok: true,
          contract: githubWebhookContract(),
          events: listGitHubDeliveries(),
        });
      },
      POST: async ({ request }) => {
        const rawBody = await request.text();
        const result = ingestGitHubWebhook({
          rawBody,
          event: request.headers.get("x-github-event"),
          delivery: request.headers.get("x-github-delivery"),
          signature: request.headers.get("x-hub-signature-256"),
        });
        if (!result.ok) {
          return Response.json({ ok: false, error: result.error }, { status: result.status });
        }
        return Response.json({ ok: true, id: result.id, signature: result.signature }, { status: 200 });
      },
    },
  },
});
