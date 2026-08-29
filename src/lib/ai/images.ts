/** Image models only. Chat models (grok-4.6, gpt-4o, …) never generate art. */

import { firstEnv } from "../remote-auth";
import { timedFetch } from "./http";
import { xaiImage } from "./xai";

export type ImageUsed = { id: string; model: string };
export type ImageTry = ImageUsed & { error: string };
export type ImageGenResult =
  | { ok: true; image: string; used: ImageUsed; tried: ImageTry[] }
  | { ok: false; error: string; tried: ImageTry[] };

function b64(mime: string, raw: string) {
  return raw.startsWith("data:") ? raw : `data:${mime};base64,${raw}`;
}

async function fromJsonImage(res: Response): Promise<string | null> {
  const body = (await res.json().catch(() => null)) as {
    data?: { b64_json?: string; url?: string; image?: string }[];
    images?: { url?: string; b64_json?: string }[];
    image_url?: string;
    predictions?: { bytesBase64Encoded?: string }[];
    generated_images?: { image?: { bytesBase64Encoded?: string } }[];
  } | null;
  if (!body) return null;
  const first = body.data?.[0] ?? body.images?.[0];
  if (first?.b64_json) return b64("image/png", first.b64_json);
  if (first?.url) return first.url;
  if (first && "image" in first && typeof first.image === "string") return first.image;
  if (body.image_url) return body.image_url;
  const gem = body.predictions?.[0]?.bytesBase64Encoded ?? body.generated_images?.[0]?.image?.bytesBase64Encoded;
  if (gem) return b64("image/png", gem);
  return null;
}

async function tryXai(prompt: string, size: "1K" | "2K"): Promise<{ image?: string; error?: string }> {
  const result = await xaiImage({ prompt, size });
  if (result.ok) return { image: result.image };
  return { error: result.error };
}

async function tryOpenAi(prompt: string, size: "1K" | "2K"): Promise<{ image?: string; error?: string }> {
  const key = firstEnv("OPENAI_API_KEY");
  if (!key) return { error: "OPENAI_API_KEY unset" };
  const model = firstEnv("OPENAI_IMAGE_MODEL") ?? "gpt-image-1";
  const res = await timedFetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt,
      n: 1,
      size: size === "2K" ? "1024x1536" : "1024x1024",
      quality: "high",
    }),
  });
  if (!res) return { error: "OpenAI timeout" };
  if (!res.ok) return { error: `OpenAI ${res.status}` };
  const image = await fromJsonImage(res);
  return image ? { image } : { error: "OpenAI empty image" };
}

async function tryGemini(prompt: string): Promise<{ image?: string; error?: string }> {
  const key = firstEnv("GEMINI_API_KEY", "GOOGLE_API_KEY");
  if (!key) return { error: "GEMINI_API_KEY unset" };
  const model = "imagen-4.0-generate-001";
  const res = await timedFetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instances: [{ prompt }], parameters: { sampleCount: 1 } }),
    },
  );
  if (!res) return { error: "Gemini timeout" };
  if (!res.ok) return { error: `Gemini ${res.status}` };
  const image = await fromJsonImage(res);
  return image ? { image } : { error: "Gemini empty image" };
}

async function tryOpenRouter(prompt: string): Promise<{ image?: string; error?: string }> {
  const key = firstEnv("OPENROUTER_API_KEY");
  if (!key) return { error: "OPENROUTER_API_KEY unset" };
  const model = "black-forest-labs/flux.1-schnell";
  const res = await timedFetch("https://openrouter.ai/api/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://hermes-gitlab-integration-a4vlrvogc-matthew-bateys-projects.vercel.app",
      "X-Title": "Card Enhancer Suite",
    },
    body: JSON.stringify({ model, prompt, n: 1 }),
  });
  if (!res) return { error: "OpenRouter timeout" };
  if (!res.ok) return { error: `OpenRouter ${res.status}` };
  const image = await fromJsonImage(res);
  return image ? { image } : { error: "OpenRouter empty image" };
}

async function tryVenice(prompt: string): Promise<{ image?: string; error?: string }> {
  const key = firstEnv("VENICE_API_KEY");
  if (!key) return { error: "VENICE_API_KEY unset" };
  const model = "venice-sd35";
  const res = await timedFetch("https://api.venice.ai/api/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt, n: 1, format: "png" }),
  });
  if (!res) return { error: "Venice timeout" };
  if (!res.ok) return { error: `Venice ${res.status}` };
  const image = await fromJsonImage(res);
  return image ? { image } : { error: "Venice empty image" };
}

async function tryHuggingFace(prompt: string): Promise<{ image?: string; error?: string }> {
  const key = firstEnv("HF_TOKEN", "HUGGINGFACE_API_KEY", "HUGGINGFACE_TOKEN");
  if (!key) return { error: "HF_TOKEN unset" };
  const model = "black-forest-labs/FLUX.1-schnell";
  const res = await timedFetch(`https://router.huggingface.co/hf-inference/models/${model}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ inputs: prompt }),
  });
  if (!res) return { error: "HuggingFace timeout" };
  if (!res.ok) return { error: `HuggingFace ${res.status}` };
  const ctype = res.headers.get("content-type") ?? "";
  if (ctype.includes("application/json")) {
    const image = await fromJsonImage(res);
    return image ? { image } : { error: "HuggingFace empty image" };
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 32) return { error: "HuggingFace empty image" };
  return { image: `data:image/png;base64,${buf.toString("base64")}` };
}

const STACK: Array<{
  id: string;
  model: string;
  run: (prompt: string, size: "1K" | "2K") => Promise<{ image?: string; error?: string }>;
}> = [
  { id: "xAI", model: "grok-imagine-image-2.0", run: tryXai },
  { id: "OpenAI", model: "gpt-image-1", run: tryOpenAi },
  { id: "Gemini", model: "imagen-4.0-generate-001", run: tryGemini },
  { id: "OpenRouter", model: "black-forest-labs/flux.1-schnell", run: tryOpenRouter },
  { id: "Venice", model: "venice-sd35", run: tryVenice },
  { id: "HuggingFace", model: "black-forest-labs/FLUX.1-schnell", run: tryHuggingFace },
];

export function imageStack() {
  return STACK.map(({ id, model }) => ({ id, model }));
}

export async function generateTradingCardImage(input: {
  prompt: string;
  size: "1K" | "2K";
}): Promise<ImageGenResult> {
  const tried: ImageTry[] = [];
  for (const step of STACK) {
    const hop = await step.run(input.prompt, input.size);
    if (hop.image) return { ok: true, image: hop.image, used: { id: step.id, model: step.model }, tried };
    tried.push({ id: step.id, model: step.model, error: hop.error ?? "failed" });
  }
  return {
    ok: false,
    error: tried.map((t) => `${t.id}: ${t.error}`).join(" · ") || "No image model keys on this host.",
    tried,
  };
}
