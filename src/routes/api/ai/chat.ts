import { createFileRoute } from "@tanstack/react-router";
import { chatBodySchema, readJsonBody, zodErrorMessage } from "@/lib/ai/schemas";
import { takeRateSlot } from "@/lib/ai/rate-limit";
import { xaiChat } from "@/lib/ai/xai";

export const Route = createFileRoute("/api/ai/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const json = await readJsonBody(request);
        if (!json.ok) return Response.json({ ok: false, error: json.error }, { status: 400 });

        const parsed = chatBodySchema.safeParse(json.body);
        if (!parsed.success) {
          return Response.json({ ok: false, error: zodErrorMessage(parsed.error) }, { status: 400 });
        }

        const limited = takeRateSlot();
        if (limited) return Response.json({ ok: false, error: limited }, { status: 429 });

        const result = await xaiChat({
          messages: [
            {
              role: "system",
              content: "You are Lumina, a precise trading-card grading assistant. Be concise.",
            },
            ...parsed.data.messages.map((m) => ({
              role: (m.role === "model" ? "assistant" : "user") as "assistant" | "user",
              content: m.text,
            })),
            { role: "user", content: parsed.data.prompt },
          ],
          maxTokens: 400,
          temperature: 0.4,
        });
        return Response.json(result, { status: result.ok ? 200 : 503 });
      },
    },
  },
});
