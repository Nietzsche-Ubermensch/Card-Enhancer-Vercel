import { createServerFn } from "@tanstack/react-start";
import { githubHeaders, huggingfaceHeaders } from "./remote-auth";
import { githubQuerySchema, modelSearchSchema, rrdbNetConfigSchema, type RrdbNetConfig } from "./ai/schemas";
import { GIT_PIPELINE, HF_BATCH_BACKEND, HF_RRDBNET_CONFIG } from "./sports-card";
import { UPSCALER_FAMILIES, type UpscalerFamily } from "./upscalers";

export type HfModel = {
  id: string;
  pipeline_tag?: string;
  downloads?: number;
  likes?: number;
  tags?: string[];
  library_name?: string;
  lastModified?: string;
};

export type GhRepo = {
  full_name: string;
  name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  topics: string[];
  updated_at: string;
  default_branch: string;
  owner: { login: string; avatar_url: string };
};

export type GhTreeEntry = {
  path: string;
  type: "blob" | "tree";
  size?: number;
};

export const FEATURED_MODELS: HfModel[] = [
  {
    id: "hlky/RealESRGAN_x2plus",
    pipeline_tag: "image-to-image",
    downloads: 519,
    likes: 1,
    tags: ["diffusers", "safetensors", "x2"],
    library_name: "diffusers",
    lastModified: "2025-12-25T18:41:27.000Z",
  },
  {
    id: "Comfy-Org/Real-ESRGAN_repackaged",
    pipeline_tag: "image-to-image",
    downloads: 496800,
    likes: 25,
    tags: ["comfyui", "super-resolution", "bsd-3-clause"],
    library_name: "diffusion-single-file",
    lastModified: "2026-08-17T06:07:49.000Z",
  },
  {
    id: "qualcomm/Real-ESRGAN-x4plus",
    pipeline_tag: "image-to-image",
    downloads: 10800,
    likes: 127,
    tags: ["pytorch", "arxiv:2107.10833", "bsd-3-clause"],
    library_name: "pytorch",
    lastModified: "2026-08-25T04:12:45.000Z",
  },
  {
    id: "Acly/Real-ESRGAN-GGUF",
    pipeline_tag: "image-to-image",
    downloads: 3700,
    likes: 2,
    tags: ["gguf", "super-resolution", "vision.cpp"],
    lastModified: "2025-08-12T16:23:21.000Z",
  },
  {
    id: "qualcomm/ESRGAN",
    pipeline_tag: "image-to-image",
    downloads: 178,
    likes: 5,
    tags: ["pytorch", "arxiv:1809.00219", "esrgan"],
    library_name: "pytorch",
    lastModified: "2026-02-25T00:00:00.000Z",
  },
  {
    id: "valhalla/SwinIR-real-sr-L-x4-GAN",
    pipeline_tag: "image-to-image",
    downloads: 577,
    likes: 2,
    tags: ["transformers", "swin-ir"],
    library_name: "transformers",
    lastModified: "2022-10-23T17:44:53.000Z",
  },
  {
    id: "litert-community/GFPGAN-v1.4-LiteRT",
    pipeline_tag: "image-to-image",
    downloads: 121,
    likes: 2,
    tags: ["gfpgan", "face-restoration", "on-device"],
    library_name: "litert",
    lastModified: "2026-07-01T00:00:00.000Z",
  },
  {
    id: "TencentARC/GFPGANv1",
    pipeline_tag: "image-to-image",
    downloads: 0,
    likes: 60,
    tags: ["arxiv:2101.04061", "face-restoration"],
    lastModified: "2022-03-02T00:00:00.000Z",
  },
];

export const FEATURED_REPOS: GhRepo[] = [
  {
    full_name: "Nietzsche-Ubermensch/card-enhancer-suite",
    name: "card-enhancer-suite",
    description:
      "Bulk enhancement and restoration pipeline for trading-card images — Gigapixel AI automation, ELAN PyTorch super-resolution, and metadata-driven quality scoring.",
    html_url: "https://github.com/Nietzsche-Ubermensch/card-enhancer-suite",
    stargazers_count: 0,
    forks_count: 0,
    language: "Python",
    topics: ["super-resolution", "trading-cards", "elan", "gigapixel"],
    updated_at: "2026-08-27T13:49:48Z",
    default_branch: "main",
    owner: {
      login: "Nietzsche-Ubermensch",
      avatar_url: "https://avatars.githubusercontent.com/u/221520027?v=4",
    },
  },
  {
    full_name: "Nietzsche-Ubermensch/CardEnhance",
    name: "CardEnhance",
    description: "CardEnhance: detect, rectify, OCR, restore, and export sports cards",
    html_url: "https://github.com/Nietzsche-Ubermensch/CardEnhance",
    stargazers_count: 0,
    forks_count: 0,
    language: "TypeScript",
    topics: ["trading-cards", "ocr", "restoration"],
    updated_at: "2026-08-27T13:25:47Z",
    default_branch: "main",
    owner: {
      login: "Nietzsche-Ubermensch",
      avatar_url: "https://avatars.githubusercontent.com/u/221520027?v=4",
    },
  },
  {
    full_name: "xindongzhang/ELAN",
    name: "ELAN",
    description: "[ECCV2022] Efficient Long-Range Attention Network for Image Super-resolution",
    html_url: "https://github.com/xindongzhang/ELAN",
    stargazers_count: 240,
    forks_count: 21,
    language: "Python",
    topics: ["efficient-inference", "super-resolution", "transformer"],
    updated_at: "2026-08-20T09:05:24Z",
    default_branch: "main",
    owner: { login: "xindongzhang", avatar_url: "https://github.com/xindongzhang.png" },
  },
  {
    full_name: "xinntao/Real-ESRGAN",
    name: "Real-ESRGAN",
    description: "Real-ESRGAN aims at developing Practical Algorithms for General Image/Video Restoration.",
    html_url: "https://github.com/xinntao/Real-ESRGAN",
    stargazers_count: 36606,
    forks_count: 4451,
    language: "Python",
    topics: ["esrgan", "image-restoration", "pytorch", "super-resolution"],
    updated_at: "2026-08-27T17:39:44Z",
    default_branch: "master",
    owner: { login: "xinntao", avatar_url: "https://github.com/xinntao.png" },
  },
  {
    full_name: "xinntao/ESRGAN",
    name: "ESRGAN",
    description: "ECCV18 Workshops - Enhanced SRGAN. Champion PIRM Challenge on Perceptual Super-Resolution.",
    html_url: "https://github.com/xinntao/ESRGAN",
    stargazers_count: 6568,
    forks_count: 1119,
    language: "Python",
    topics: ["esrgan", "super-resolution"],
    updated_at: "2026-08-27T09:42:54Z",
    default_branch: "master",
    owner: { login: "xinntao", avatar_url: "https://github.com/xinntao.png" },
  },
  {
    full_name: "JingyunLiang/SwinIR",
    name: "SwinIR",
    description: "SwinIR: Image Restoration Using Swin Transformer (arxiv, pretrained models, visual results)",
    html_url: "https://github.com/JingyunLiang/SwinIR",
    stargazers_count: 0,
    forks_count: 0,
    language: "Python",
    topics: ["swin-transformer", "super-resolution", "image-restoration"],
    updated_at: "2026-08-28T00:00:00Z",
    default_branch: "main",
    owner: { login: "JingyunLiang", avatar_url: "https://github.com/JingyunLiang.png" },
  },
];

function mapHf(raw: Record<string, unknown>): HfModel {
  return {
    id: String(raw.id ?? raw.modelId ?? ""),
    pipeline_tag: typeof raw.pipeline_tag === "string" ? raw.pipeline_tag : undefined,
    downloads: typeof raw.downloads === "number" ? raw.downloads : undefined,
    likes: typeof raw.likes === "number" ? raw.likes : undefined,
    tags: Array.isArray(raw.tags) ? (raw.tags as string[]).slice(0, 8) : [],
    library_name: typeof raw.library_name === "string" ? raw.library_name : undefined,
    lastModified: typeof raw.lastModified === "string" ? raw.lastModified : undefined,
  };
}

function mapGh(raw: Record<string, unknown>): GhRepo {
  const owner = (raw.owner ?? {}) as Record<string, unknown>;
  return {
    full_name: String(raw.full_name ?? ""),
    name: String(raw.name ?? ""),
    description: typeof raw.description === "string" ? raw.description : null,
    html_url: String(raw.html_url ?? ""),
    stargazers_count: Number(raw.stargazers_count ?? 0),
    forks_count: Number(raw.forks_count ?? 0),
    language: typeof raw.language === "string" ? raw.language : null,
    topics: Array.isArray(raw.topics) ? (raw.topics as string[]) : [],
    updated_at: String(raw.updated_at ?? ""),
    default_branch: String(raw.default_branch ?? "main"),
    owner: {
      login: String(owner.login ?? ""),
      avatar_url: String(owner.avatar_url ?? ""),
    },
  };
}

export async function queryHfModels(input: { query: string; limit: number }) {
  const q = input.query.trim() || "super resolution";
  const limit = Math.min(Math.max(input.limit ?? 16, 1), 30);
  try {
    const url = new URL("https://huggingface.co/api/models");
    url.searchParams.set("search", q);
    url.searchParams.set("sort", "downloads");
    url.searchParams.set("direction", "-1");
    url.searchParams.set("limit", String(limit));
    const res = await fetch(url, {
      headers: huggingfaceHeaders(),
      signal: AbortSignal.timeout(8000),
    });
      if (!res.ok) return { ok: false as const, source: "error" as const, models: [], error: `Hugging Face returned ${res.status}` };
    const body = (await res.json()) as Record<string, unknown>[];
    const models = body.map(mapHf).filter((m) => m.id);
    if (!models.length) return { ok: false as const, source: "error" as const, models: [], error: "No models matched that search" };
    return { ok: true as const, source: "live" as const, models };
  } catch (error) {
    return { ok: false as const, source: "error" as const, models: [], error: error instanceof Error ? error.message : "Hugging Face is unavailable" };
  }
}

export type FamilyLive = UpscalerFamily & {
  live: boolean;
  downloads?: number;
  likes?: number;
};

export async function loadUpscalerFamilies(): Promise<FamilyLive[]> {
  return Promise.all(
    UPSCALER_FAMILIES.map(async (family) => {
      if (!family.hub) return { ...family, live: false };
      try {
        const res = await fetch(`https://huggingface.co/api/models/${family.hub}`, {
          headers: huggingfaceHeaders(),
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return { ...family, live: false };
        const body = (await res.json()) as { downloads?: number; likes?: number };
        return { ...family, live: true, downloads: body.downloads, likes: body.likes };
      } catch {
        return { ...family, live: false };
      }
    }),
  );
}

export const getUpscalerFamilies = createServerFn({ method: "GET" }).handler(async () => loadUpscalerFamilies());

export const searchHfModels = createServerFn({ method: "POST" })
  .validator((input: unknown) => modelSearchSchema.parse(input))
  .handler(async ({ data }) => queryHfModels(data));

export const searchGithubRepos = createServerFn({ method: "POST" })
  .validator((input: { query: string }) => input)
  .handler(async ({ data }) => {
    const q = data.query.trim() || "super-resolution image restoration";
    try {
      const url = new URL("https://api.github.com/search/repositories");
      url.searchParams.set("q", q);
      url.searchParams.set("sort", "stars");
      url.searchParams.set("per_page", "12");
      const res = await fetch(url, {
        headers: githubHeaders(),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return { ok: false as const, source: "error" as const, repos: [], error: `GitHub returned ${res.status}` };
      const body = (await res.json()) as { items?: Record<string, unknown>[] };
      const repos = (body.items ?? []).map(mapGh).filter((r) => r.full_name);
      if (!repos.length) return { ok: false as const, source: "error" as const, repos: [], error: "No repositories matched that search" };
      return { ok: true as const, source: "live" as const, repos };
    } catch (error) {
      return { ok: false as const, source: "error" as const, repos: [], error: error instanceof Error ? error.message : "GitHub is unavailable" };
    }
  });

export async function loadGithubReadme(owner: string, repo: string) {
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/readme`, {
      headers: { ...githubHeaders(), Accept: "application/vnd.github.raw" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { ok: false as const, error: `GitHub ${res.status}` };
    const text = (await res.text()).slice(0, 12000);
    return { ok: true as const, text };
  } catch {
    return { ok: false as const, error: "Could not load README" };
  }
}

export const getGithubReadme = createServerFn({ method: "POST" })
  .validator((input: { owner: string; repo: string }) => input)
  .handler(async ({ data }) => {
    const owner = data.owner.replace(/[^A-Za-z0-9_.-]/g, "");
    const repo = data.repo.replace(/[^A-Za-z0-9_.-]/g, "");
    return loadGithubReadme(owner, repo);
  });

export async function loadGithubTree(owner: string, repo: string) {
  const isPipeline = owner === GIT_PIPELINE.owner && repo === GIT_PIPELINE.repo;
  const fallbackTree: GhTreeEntry[] = PROTOCOL_FILES.map((path) => ({ path, type: "blob" as const }));
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`, {
      headers: githubHeaders(),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      if (isPipeline) {
        return { ok: true as const, source: "fallback" as const, tree: fallbackTree, fileCount: fallbackTree.length };
      }
      return { ok: false as const, error: `GitHub ${res.status}` };
    }
    const body = (await res.json()) as { tree?: { path: string; type: string; size?: number }[] };
    const blobs = (body.tree ?? []).filter((e) => e.type === "blob");
    const tree: GhTreeEntry[] = (body.tree ?? [])
      .filter((e) => e.type === "blob" || e.type === "tree")
      .slice(0, 80)
      .map((e) => ({
        path: e.path,
        type: e.type === "tree" ? "tree" : "blob",
        size: e.size,
      }));
    return { ok: true as const, source: "live" as const, tree, fileCount: blobs.length };
  } catch {
    if (isPipeline) {
      return { ok: true as const, source: "fallback" as const, tree: fallbackTree, fileCount: fallbackTree.length };
    }
    return { ok: false as const, error: "Could not load tree" };
  }
}

export const getGithubTree = createServerFn({ method: "POST" })
  .validator((input: unknown) => githubQuerySchema.parse(input))
  .handler(async ({ data }) => loadGithubTree(data.owner, data.repo));

export type HfFile = { path: string; size?: number };

export type HfRecipe = {
  source: "live" | "fallback";
  id: string;
  downloads?: number;
  likes?: number;
  pipeline_tag?: string;
  className: string;
  scale: number;
  numBlock: number;
  numFeat: number;
  weightsMb: number;
  fp16Mb: number;
  files: HfFile[];
  config: RrdbNetConfig;
};

const PROTOCOL_FILES = [
  "gigapixel/batch.py",
  "elan/model.py",
  "card_enhancer/rewards.py",
  "configs/elan_x2.yml",
];

const HF_FILE_FALLBACK: HfFile[] = [
  { path: "config.json", size: 189 },
  { path: HF_BATCH_BACKEND.weightsFile, size: 66_878_604 },
  { path: HF_BATCH_BACKEND.fp16File, size: 33_472_030 },
];

function fallbackRecipe(): HfRecipe {
  return {
    source: "fallback",
    id: HF_BATCH_BACKEND.id,
    downloads: 519,
    likes: 1,
    pipeline_tag: "image-to-image",
    className: HF_BATCH_BACKEND.className,
    scale: HF_BATCH_BACKEND.scale,
    numBlock: HF_BATCH_BACKEND.numBlock,
    numFeat: HF_BATCH_BACKEND.numFeat,
    weightsMb: HF_BATCH_BACKEND.weightsMb,
    fp16Mb: HF_BATCH_BACKEND.fp16Mb,
    files: HF_FILE_FALLBACK,
    config: HF_RRDBNET_CONFIG,
  };
}

export async function loadHfRecipe(): Promise<HfRecipe> {
  const fallback = fallbackRecipe();
  const [modelSettled, configSettled] = await Promise.allSettled([
    fetch(HF_BATCH_BACKEND.apiUrl, {
      headers: huggingfaceHeaders(),
      signal: AbortSignal.timeout(8000),
    }).then(async (res) => {
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()) as Record<string, unknown>;
    }),
    fetch(HF_BATCH_BACKEND.configUrl, {
      headers: huggingfaceHeaders(),
      signal: AbortSignal.timeout(8000),
    }).then(async (res) => {
      if (!res.ok) throw new Error(String(res.status));
      return rrdbNetConfigSchema.parse(await res.json());
    }),
  ]);

  const live = modelSettled.status === "fulfilled" || configSettled.status === "fulfilled";
  const raw = modelSettled.status === "fulfilled" ? modelSettled.value : {};
  const siblings = Array.isArray(raw.siblings) ? (raw.siblings as { rfilename?: string; size?: number }[]) : [];
  const files: HfFile[] = siblings.length
    ? siblings.filter((s) => s.rfilename).map((s) => ({ path: String(s.rfilename), size: s.size }))
    : fallback.files;
  const weight = files.find((f) => f.path === HF_BATCH_BACKEND.weightsFile);
  const fp16 = files.find((f) => f.path === HF_BATCH_BACKEND.fp16File);
  const config = configSettled.status === "fulfilled" ? configSettled.value : fallback.config;

  return {
    source: live ? "live" : "fallback",
    id: String(raw.id ?? fallback.id),
    downloads: typeof raw.downloads === "number" ? raw.downloads : fallback.downloads,
    likes: typeof raw.likes === "number" ? raw.likes : fallback.likes,
    pipeline_tag: typeof raw.pipeline_tag === "string" ? raw.pipeline_tag : fallback.pipeline_tag,
    className: config._class_name,
    scale: config.scale,
    numBlock: config.num_block,
    numFeat: config.num_feat,
    weightsMb: weight?.size ? Math.round((weight.size / 1e6) * 10) / 10 : fallback.weightsMb,
    fp16Mb: fp16?.size ? Math.round((fp16.size / 1e6) * 10) / 10 : fallback.fp16Mb,
    files,
    config,
  };
}

export type PipelineSnapshot = {
  git: {
    source: "live" | "fallback";
    files: string[];
    fileCount: number;
    repo: string;
  };
  hf: HfRecipe;
};

export async function loadPipelineSnapshot(): Promise<PipelineSnapshot> {
  const gitFallback = {
    source: "fallback" as const,
    files: PROTOCOL_FILES,
    fileCount: PROTOCOL_FILES.length,
    repo: `${GIT_PIPELINE.owner}/${GIT_PIPELINE.repo}`,
  };

  const [gitSettled, hf] = await Promise.all([
    fetch(
      `https://api.github.com/repos/${GIT_PIPELINE.owner}/${GIT_PIPELINE.repo}/git/trees/HEAD?recursive=1`,
      {
        headers: githubHeaders(),
        signal: AbortSignal.timeout(8000),
      },
    )
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        return (await res.json()) as { tree?: { path: string; type: string }[] };
      })
      .then((body) => {
        const blobs = (body.tree ?? []).filter((e) => e.type === "blob").map((e) => e.path);
        const files = PROTOCOL_FILES.filter((p) => blobs.includes(p));
        return {
          source: "live" as const,
          files: files.length ? files : blobs.slice(0, 8),
          fileCount: blobs.length,
          repo: `${GIT_PIPELINE.owner}/${GIT_PIPELINE.repo}`,
        };
      })
      .catch(() => gitFallback),
    loadHfRecipe(),
  ]);

  return { git: gitSettled, hf };
}

export const getPipelineSnapshot = createServerFn({ method: "POST" }).handler(async () => loadPipelineSnapshot());
