import { createFileRoute } from "@tanstack/react-router";
import type { AnalysisResult } from "@/lib/types";
import { analyzeBodySchema, readJsonBody, zodErrorMessage } from "@/lib/ai/schemas";
import { takeRateSlot } from "@/lib/ai/rate-limit";
import { xaiChat } from "@/lib/ai/xai";

const SYSTEM_PROMPT =
  "You are Lumina, a precise trading-card grading assistant. You know PSA, BGS, SGC, and CGC scales. Be conservative. Return JSON only.";

export const Route = createFileRoute("/api/ai/analyze")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const json = await readJsonBody(request);
        if (!json.ok) return Response.json({ ok: false, error: json.error }, { status: 400 });

        const parsed = analyzeBodySchema.safeParse(json.body);
        if (!parsed.success) {
          return Response.json({ ok: false, error: zodErrorMessage(parsed.error) }, { status: 400 });
        }

        const limited = takeRateSlot();
        if (limited) return Response.json({ ok: false, error: limited }, { status: 429 });

        const result = await xaiChat({
          maxTokens: 700,
          temperature: 0.2,
          json: true,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `Analyze this trading card photograph. Return ONLY JSON: {"damageScore":0-100,"gradeEstimate":"PSA 8 NM-MT","issues":[],"detailedIssues":[],"recommendedFixes":[],"boundingBox":[ymin,xmin,ymax,xmax]}`,
                },
                {
                  type: "image_url",
                  image_url: { url: `data:${parsed.data.mimeType};base64,${parsed.data.imageBase64}` },
                },
              ],
            },
          ],
        });
        if (!result.ok) return Response.json(result, { status: 503 });
        try {
          const analysis = JSON.parse(result.text) as AnalysisResult;
          return Response.json({ ok: true, analysis });
        } catch {
          return Response.json({ ok: false, error: "Could not parse analysis." }, { status: 503 });
        }
      },
    },
  },
});
