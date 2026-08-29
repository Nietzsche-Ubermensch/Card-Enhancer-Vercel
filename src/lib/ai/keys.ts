import { credentialPresence } from "../remote-auth";
import { ACTIVE_AI_PROVIDER, AI_PROVIDER_META, type AIProvider } from "./provider";

export function hasKey(provider: AIProvider): boolean {
  return Boolean(process.env[AI_PROVIDER_META[provider].env]);
}

export function requireKey(provider: AIProvider = ACTIVE_AI_PROVIDER): string | null {
  const value = process.env[AI_PROVIDER_META[provider].env];
  return value || null;
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
