import { createServerFn } from "@tanstack/react-start";
import type { AnalysisResult } from "./types";
import { ACTIVE_AI_PROVIDER, AI_PROVIDER_META } from "./ai/provider";
import { providerStatus } from "./ai/keys";
import { takeRateSlot } from "./ai/rate-limit";
import { xaiChat, xaiImage } from "./ai/xai";
import { analyzeBodySchema, chatBodySchema, generateBodySchema } from "./ai/schemas";
import { credentialPresence } from "./remote-auth";

export { AI_PROVIDERS, ACTIVE_AI_PROVIDER, AI_PROVIDER_META } from "./ai/provider";
export type { AIProvider } from "./ai/provider";

const SYSTEM_PROMPT =
  "You are Lumina, a precise trading-card grading assistant. You know PSA, BGS, SGC, and CGC scales, centering math, surface wear, corners, edges, and restoration ethics. Be specific, concise, and practical. Never invent certification numbers.";

export const getAiStatus = createServerFn({ method: "GET" }).handler(async () => {
  const status = providerStatus();
  return {
    available: status.available,
    provider: status.active,
    models: AI_PROVIDER_META[ACTIVE_AI_PROVIDER],
    keys: status.keys,
    credentials: credentialPresence(),
  };
});

export const askLumina = createServerFn({ method: "POST" })
  .validator((input: unknown) => chatBodySchema.parse(input))
  .handler(async ({ data }) => {
    const limited = takeRateSlot();
    if (limited) return { ok: false as const, error: limited };

    const messages = [
      { role: "system" as const, content: SYSTEM_PROMPT },
      ...data.messages.map((m) => ({
        role: (m.role === "model" ? "assistant" : "user") as "assistant" | "user",
        content: m.text,
      })),
      { role: "user" as const, content: data.prompt },
    ];

    return xaiChat({ messages, maxTokens: 900, temperature: 0.5 });
  });

export const generateCardArt = createServerFn({ method: "POST" })
  .validator((input: unknown) => generateBodySchema.parse(input))
  .handler(async ({ data }) => {
    const limited = takeRateSlot();
    if (limited) return { ok: false as const, error: limited };
    const prompt = `Trading card artwork, centered subject, collectible card composition, sharp print-ready detail, cinematic lighting, no watermark, no text overlay unless requested. ${data.prompt}`;
    return xaiImage({ prompt, size: data.size });
  });

export const analyzeCard = createServerFn({ method: "POST" })
  .validator((input: unknown) => analyzeBodySchema.parse(input))
  .handler(async ({ data }): Promise<{ ok: true; analysis: AnalysisResult } | { ok: false; error: string }> => {
    const limited = takeRateSlot();
    if (limited) return { ok: false, error: limited };

    const prompt = `Analyze this trading card photograph.
Return ONLY valid JSON with this shape:
{
  "damageScore": 0-100 (100 is gem mint),
  "gradeEstimate": "PSA 8 NM-MT",
  "issues": ["short issue strings"],
  "detailedIssues": [{"type":"Scratch","description":"...","severity":0-100,"boundingBox":[ymin,xmin,ymax,xmax]}],
  "recommendedFixes": ["..."],
  "boundingBox": [ymin,xmin,ymax,xmax]
}
Bounding boxes are floats 0-1 relative to the full image. Be conservative.`;

    const result = await xaiChat({
      maxTokens: 700,
      temperature: 0.2,
      json: true,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: { url: `data:${data.mimeType};base64,${data.imageBase64}` },
            },
          ],
        },
      ],
    });
    if (!result.ok) return result;
    try {
      const parsed = JSON.parse(result.text) as AnalysisResult;
      return {
        ok: true,
        analysis: {
          damageScore: Number(parsed.damageScore) || 0,
          issues: parsed.issues ?? [],
          detailedIssues: parsed.detailedIssues ?? [],
          recommendedFixes: parsed.recommendedFixes ?? [],
          boundingBox: parsed.boundingBox,
          gradeEstimate: parsed.gradeEstimate,
        },
      };
    } catch {
      return { ok: false, error: "Could not parse analysis." };
    }
  });
