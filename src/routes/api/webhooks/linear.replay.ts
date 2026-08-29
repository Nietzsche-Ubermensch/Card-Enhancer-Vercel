import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { replayLinearSample, webhookSecret, type ReplaySample } from "@/lib/linear-webhook";

const bodySchema = z.object({
  sample: z.enum(["issue.update", "issue.create", "comment.create"]).default("issue.update"),
});

export const Route = createFileRoute("/api/webhooks/linear/replay")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let json: unknown = {};
        try {
          json = await request.json();
        } catch {
          json = {};
        }
        const parsed = bodySchema.safeParse(json);
        if (!parsed.success) {
          return Response.json({ ok: false, error: "invalid sample" }, { status: 400 });
        }
        const result = replayLinearSample(parsed.data.sample as ReplaySample, webhookSecret());
        if (!result.ok) {
          return Response.json({ ok: false, error: result.error }, { status: result.status });
        }
        return Response.json({ ok: true, event: result.event });
      },
    },
  },
});
