import { firstEnv } from "../remote-auth";
import {
  AI_PROVIDER_META,
  GATEWAY_BASE,
  GATEWAY_CHAT_MODEL,
  GATEWAY_IMAGE_MODEL,
} from "./provider";
import { timedFetch } from "./http";

const meta = AI_PROVIDER_META.xAI;

function headers(apiKey: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
}

function transport(): { key: string; baseUrl: string; chatModel: string; imageModel: string } | null {
  const xai = firstEnv("XAI_API_KEY", "GROK_API_KEY", "XAI_KEY", "X_AI_API_KEY");
  if (xai) {
    return {
      key: xai,
      baseUrl: meta.baseUrl,
      chatModel: meta.chatModel,
      imageModel: meta.imageModel,
    };
  }
  const gw = firstEnv("AI_GATEWAY_API_KEY");
  if (gw) {
    return {
      key: gw,
      baseUrl: GATEWAY_BASE,
      chatModel: GATEWAY_CHAT_MODEL,
      imageModel: GATEWAY_IMAGE_MODEL,
    };
  }
  return null;
}

export type XaiChatMessage =
  | { role: "system" | "user" | "assistant"; content: string }
  | {
      role: "user";
      content: Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      >;
    };

export async function xaiChat(input: {
  messages: XaiChatMessage[];
  maxTokens: number;
  temperature: number;
  json?: boolean;
}): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const t = transport();
  if (!t) return { ok: false, error: "AI is not available in this environment." };

  const res = await timedFetch(`${t.baseUrl}/chat/completions`, {
    method: "POST",
    headers: headers(t.key),
    body: JSON.stringify({
      model: t.chatModel,
      messages: input.messages,
      max_tokens: input.maxTokens,
      temperature: input.temperature,
      ...(input.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!res) return { ok: false, error: "AI request timed out." };
  if (!res.ok) return { ok: false, error: `xAI API error ${res.status}` };
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return { ok: true, text: body.choices?.[0]?.message?.content ?? "" };
}

export async function xaiImage(input: {
  prompt: string;
  size: "1K" | "2K";
}): Promise<{ ok: true; image: string } | { ok: false; error: string }> {
  const t = transport();
  if (!t) return { ok: false, error: "AI is not available in this environment." };

  const res = await timedFetch(`${t.baseUrl}/images/generations`, {
    method: "POST",
    headers: headers(t.key),
    body: JSON.stringify({
      model: t.imageModel,
      prompt: input.prompt,
      n: 1,
      resolution: input.size === "2K" ? "2k" : "1k",
      response_format: "b64_json",
    }),
  });
  if (!res) return { ok: false, error: "AI request timed out." };
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    return { ok: false, error: `Image generation failed (${res.status}). ${errText.slice(0, 180)}` };
  }
  const body = (await res.json()) as { data?: { b64_json?: string; url?: string }[] };
  const first = body.data?.[0];
  if (first?.b64_json) return { ok: true, image: `data:image/png;base64,${first.b64_json}` };
  if (first?.url) return { ok: true, image: first.url };
  return { ok: false, error: "No image returned." };
}
