const HF_ID = "hlky/RealESRGAN_x2plus" as const;
export const REALESRGAN_PATH = "/api/upscale" as const;
const INFER = `https://router.huggingface.co/hf-inference/models/${HF_ID}`;

function firstEnv(...names: string[]) {
  for (const n of names) {
    const v = process.env[n]?.trim();
    if (v) return v;
  }
  return null;
}

export function realesrganContract() {
  return {
    ok: true as const,
    path: REALESRGAN_PATH,
    model: HF_ID,
    className: "RRDBNet",
    scale: 2,
    tokenPresent: Boolean(firstEnv("HF_TOKEN", "HUGGINGFACE_API_KEY", "HUGGINGFACE_TOKEN")),
    infer: INFER,
    note: "Hub RRDBNet ×2. Not Imagine. Not WebGL. HF_TOKEN on Node host, never VITE_*.",
  };
}

function decodeDataUrl(image: string): { mime: string; bytes: Buffer } | null {
  const m = /^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/]+=*)$/i.exec(image.trim());
  if (!m) return null;
  const mime = m[1].toLowerCase() === "image/jpg" ? "image/jpeg" : m[1];
  return { mime, bytes: Buffer.from(m[2], "base64") };
}

export type UpscaleOk = { ok: true; image: string; model: string; scale: number; bytes: number };
export type UpscaleErr = { ok: false; error: string; status: number };

export async function runRealEsrgan(image: string): Promise<UpscaleOk | UpscaleErr> {
  const token = firstEnv("HF_TOKEN", "HUGGINGFACE_API_KEY", "HUGGINGFACE_TOKEN");
  if (!token) return { ok: false, status: 503, error: "HF_TOKEN unset on Node host" };
  const decoded = decodeDataUrl(image);
  if (!decoded) return { ok: false, status: 400, error: "image must be a data:image/(jpeg|png|webp);base64 URL" };
  if (decoded.bytes.length < 32) return { ok: false, status: 400, error: "empty image" };
  if (decoded.bytes.length > 4_500_000) return { ok: false, status: 413, error: "image too large (max ~4.5MB)" };

  let res: Response;
  try {
    res = await fetch(INFER, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": decoded.mime,
        Accept: "image/png",
      },
      body: new Uint8Array(decoded.bytes),
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    return { ok: false, status: 504, error: "Hugging Face Real-ESRGAN timeout" };
  }

  const ctype = res.headers.get("content-type") ?? "";
  if (!res.ok) {
    const errText = ctype.includes("json")
      ? JSON.stringify(await res.json().catch(() => ({}))).slice(0, 240)
      : (await res.text()).slice(0, 240);
    return { ok: false, status: res.status, error: `Hub ${res.status}: ${errText || HF_ID}` };
  }
  if (ctype.includes("application/json")) {
    const body = (await res.json()) as { error?: string };
    return { ok: false, status: 502, error: body.error ?? "Hub JSON error (model loading?)" };
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 32) return { ok: false, status: 502, error: "Hub empty image" };
  return {
    ok: true,
    image: `data:image/png;base64,${buf.toString("base64")}`,
    model: HF_ID,
    scale: 2,
    bytes: buf.length,
  };
}

export function parseDataUrl(image: string) {
  return decodeDataUrl(image);
}
