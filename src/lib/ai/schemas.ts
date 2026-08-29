import { z } from "zod";

export const chatBodySchema = z.object({
  prompt: z.string().trim().min(1, "prompt must be 1–4000 characters").max(4000),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "model"]),
        text: z.string().max(4000),
      }),
    )
    .max(12)
    .default([]),
});

export const generateBodySchema = z.object({
  prompt: z.string().trim().min(1, "prompt must be 1–2000 characters").max(2000),
  size: z.enum(["1K", "2K"]),
});

export const analyzeBodySchema = z.object({
  imageBase64: z.string().min(1, "image required").max(6_000_000, "image too large"),
  mimeType: z.string().regex(/^image\/(jpeg|jpg|png|webp)$/i, "mimeType must be image/jpeg, image/png, or image/webp"),
});

export const modelSearchSchema = z.object({
  query: z.string().trim().min(1).max(80).default("Real-ESRGAN"),
  limit: z.coerce.number().int().min(1).max(30).default(16),
});

export const githubQuerySchema = z.object({
  owner: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_.-]+$/, "invalid owner")
    .default("Nietzsche-Ubermensch"),
  repo: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_.-]+$/, "invalid repo")
    .default("card-enhancer-suite"),
});

/** Hugging Face `hlky/RealESRGAN_x2plus` config.json — GitMCP/HF recipe. */
export const rrdbNetConfigSchema = z.object({
  _class_name: z.literal("RRDBNet"),
  _diffusers_version: z.string().optional(),
  num_block: z.number().int().positive(),
  num_feat: z.number().int().positive(),
  num_grow_ch: z.number().int().positive(),
  num_in_ch: z.number().int().positive(),
  num_out_ch: z.number().int().positive(),
  scale: z.number().int().positive(),
});

/** JSONL line written by gigapixel/batch.py process_single. */
export const jsonlEntrySchema = z.object({
  input: z.string().min(1),
  output: z.string().min(1),
  success: z.boolean(),
  error: z.string().nullable().optional(),
  ms: z.number().optional(),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
});

export type ChatBody = z.infer<typeof chatBodySchema>;
export type GenerateBody = z.infer<typeof generateBodySchema>;
export type AnalyzeBody = z.infer<typeof analyzeBodySchema>;
export type ModelSearch = z.infer<typeof modelSearchSchema>;
export type RrdbNetConfig = z.infer<typeof rrdbNetConfigSchema>;
export type JsonlEntryInput = z.infer<typeof jsonlEntrySchema>;

export function zodErrorMessage(err: z.ZodError): string {
  return err.issues[0]?.message ?? "Invalid request";
}

export async function readJsonBody(
  request: Request,
): Promise<{ ok: true; body: unknown } | { ok: false; error: string }> {
  try {
    return { ok: true, body: await request.json() };
  } catch {
    return { ok: false, error: "JSON body required" };
  }
}
