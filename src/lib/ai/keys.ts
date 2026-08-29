import { credentialPresence, firstEnv, hasEnv } from "../remote-auth";
import { ACTIVE_AI_PROVIDER, AI_PROVIDER_META, type AIProvider } from "./provider";

/** Server-only aliases. Never VITE_*. */
const XAI_ENV_ALIASES = [
  "XAI_API_KEY",
  "GROK_API_KEY",
  "XAI_KEY",
  "X_AI_API_KEY",
  "AI_GATEWAY_API_KEY",
] as const;

export function hasKey(provider: AIProvider): boolean {
  return provider === "xAI" && hasEnv(...XAI_ENV_ALIASES);
}

export function requireKey(provider: AIProvider = ACTIVE_AI_PROVIDER): string | null {
  return provider === "xAI" ? firstEnv(...XAI_ENV_ALIASES) : null;
}

export function providerStatus() {
  return {
    active: ACTIVE_AI_PROVIDER,
    available: hasKey(ACTIVE_AI_PROVIDER),
    keys: Object.fromEntries(Object.keys(AI_PROVIDER_META).map((id) => [id, hasKey(id as AIProvider)])) as Record<
      AIProvider,
      boolean
    >,
    credentials: credentialPresence(),
  };
}
