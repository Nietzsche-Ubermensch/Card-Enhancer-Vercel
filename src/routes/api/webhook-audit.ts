import { createFileRoute } from "@tanstack/react-router";
import { LINEAR_CONNECT_TRIGGER, WEBHOOK_CREATE_MUTATION, WEBHOOK_CREATE_VARS, WEBHOOK_LIST_QUERY } from "@/lib/linear-graphql";
import { githubWebhookContract } from "@/lib/github-webhook";
import { hfWebhookContract } from "@/lib/huggingface-webhook";
import { webhookContract } from "@/lib/linear-webhook";
import { LINEAR_CONNECT_ID, LINEAR_CONNECT_TRIGGER_URL } from "@/lib/connect/ids";

export const Route = createFileRoute("/api/webhook-audit")({
  server: {
    handlers: {
      GET: async () => {
        return Response.json({
          ok: true,
          localhost8644: {
            url: "http://localhost:8644/webhooks/github",
            reachableFromThisHost: false,
            githubCanDeliver: false,
            linearCanDeliver: false,
            huggingfaceCanDeliver: false,
            reason: "No listener. GitHub and Linear require public HTTPS.",
          },
          ingest: {
            linearHmac: webhookContract(),
            linearConnect: { path: "/triggers/linear", url: LINEAR_CONNECT_TRIGGER_URL, connector: LINEAR_CONNECT_ID },
            github: githubWebhookContract(),
            huggingface: hfWebhookContract(),
          },
          graphql: {
            list: WEBHOOK_LIST_QUERY,
            create: WEBHOOK_CREATE_MUTATION,
            vars: WEBHOOK_CREATE_VARS,
            target: LINEAR_CONNECT_TRIGGER,
          },
        });
      },
    },
  },
});
