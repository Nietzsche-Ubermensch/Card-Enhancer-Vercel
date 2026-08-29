/** Entitled generator is xAI only. No Gemini / OpenRouter / Venice / OpenAI. */
export const AI_PROVIDERS = ["xAI"] as const;
export type AIProvider = (typeof AI_PROVIDERS)[number];

export const ACTIVE_AI_PROVIDER: AIProvider = "xAI";

export type AiProviderMeta = {
  id: AIProvider;
  chatModel: string;
  visionModel: string;
  imageModel: string;
  env: string;
  baseUrl: string;
  entitled: boolean;
};

export const AI_PROVIDER_META: Record<AIProvider, AiProviderMeta> = {
  xAI: {
    id: "xAI",
    chatModel: "grok-4.6",
    visionModel: "grok-4.6",
    imageModel: "grok-imagine-image-2.0",
    env: "XAI_API_KEY",
    baseUrl: "https://api.x.ai/v1",
    entitled: true,
  },
};

export const GATEWAY_BASE = "https://ai-gateway.vercel.sh/v1";
export const GATEWAY_CHAT_MODEL = "spacexai/grok-4.6";
export const GATEWAY_IMAGE_MODEL = "spacexai/grok-imagine-image-2.0";
