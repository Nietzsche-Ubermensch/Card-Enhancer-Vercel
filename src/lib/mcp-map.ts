/** What this suite actually runs. No Gemini key, no Gemini provider. */
export const MCP_MAP = [
  {
    id: "linear",
    ours: "Linear MCP",
    live: true,
    note: "Juggintillwedie · JUG board. Vercel Connect linear/hermes-gitlab-integration (app). HMAC /api/webhooks/linear; OIDC /triggers/linear.",
  },
  {
    id: "github",
    ours: "GitHub MCP",
    live: true,
    note: "Nietzsche-Ubermensch/card-enhancer-suite · gigapixel/batch.py",
  },
  {
    id: "xai",
    ours: "xAI",
    live: false,
    note: "Lumina + Imagine. XAI_API_KEY on Nitro. live flips true when /api/ai/status.keys.xAI is true.",
  },
  {
    id: "huggingface",
    ours: "Hugging Face",
    live: true,
    note: "hlky/RealESRGAN_x2plus · RRDBNet ×2. Hub is public.",
  },
  {
    id: "host",
    ours: "TanStack Start + Nitro",
    live: true,
    note: "One Node process. WebGL batch in the browser. No pip, no FastAPI, no Next :8000.",
  },
] as const;
