import { createFileRoute } from "@tanstack/react-router";
import { generateBodySchema, readJsonBody, zodErrorMessage } from "@/lib/ai/schemas";
import { takeRateSlot } from "@/lib/ai/rate-limit";
import { xaiImage } from "@/lib/ai/xai";

export const Route = createFileRoute("/api/ai/generate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const json = await readJsonBody(request);
        if (!json.ok) return Response.json({ ok: false, error: json.error }, { status: 400 });

        const parsed = generateBodySchema.safeParse(json.body);
        if (!parsed.success) {
          return Response.json({ ok: false, error: zodErrorMessage(parsed.error) }, { status: 400 });
        }

        const limited = takeRateSlot();
        if (limited) return Response.json({ ok: false, error: limited }, { status: 429 });

        const prompt = `Trading card artwork, centered subject, collectible card composition, sharp print-ready detail, cinematic lighting, no watermark, no text overlay unless requested. ${parsed.data.prompt}`;
        const result = await xaiImage({ prompt, size: parsed.data.size });
        return Response.json(result, { status: result.ok ? 200 : 503 });
      },
    },
  },
});
