/** Presence-only credential helpers. Never return secret values. */

export function hasEnv(...names: string[]): boolean {
  return names.some((n) => Boolean(process.env[n]));
}

export function firstEnv(...names: string[]): string | null {
  for (const n of names) {
    const v = process.env[n];
    if (v) return v;
  }
  return null;
}

export function huggingfaceHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const token = firstEnv("HF_TOKEN", "HUGGINGFACE_API_KEY", "HUGGINGFACE_TOKEN");
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "CardEnhancerSuite/1.0",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const token = firstEnv("GITHUB_TOKEN", "GH_TOKEN", "GITHUB_PAT");
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export function credentialPresence() {
  return {
    XAI_API_KEY: hasEnv("XAI_API_KEY"),
    HF_TOKEN: hasEnv("HF_TOKEN", "HUGGINGFACE_API_KEY", "HUGGINGFACE_TOKEN"),
    GITHUB_TOKEN: hasEnv("GITHUB_TOKEN", "GH_TOKEN", "GITHUB_PAT"),
    LINEAR_API_KEY: hasEnv("LINEAR_API_KEY", "LINEAR_API_TOKEN"),
    LINEAR_WEBHOOK_SECRET: hasEnv("LINEAR_WEBHOOK_SECRET"),
  };
}
