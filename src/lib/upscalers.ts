/** Four-family upscaler rack. Hub IDs and GitHub repos are live; scores are operator notes. */
export type UpscalerFamily = {
  id: "esrgan" | "real-esrgan" | "swinir" | "lfesr";
  name: string;
  year: number;
  paper: string;
  arxiv?: string;
  paperUrl: string;
  github: string | null;
  githubUrl: string | null;
  hub: string | null;
  hubUrl: string | null;
  quality: number | null;
  seconds: number | null;
  artifacts: string;
  bestFor: string;
  strengths: string;
  weakness: string;
  batchRecipe: boolean;
  search: string;
};

export const UPSCALER_FAMILIES: UpscalerFamily[] = [
  {
    id: "esrgan",
    name: "ESRGAN",
    year: 2018,
    paper: "Enhanced Super-Resolution GAN",
    arxiv: "1809.00219",
    paperUrl: "https://arxiv.org/abs/1809.00219",
    github: "xinntao/ESRGAN",
    githubUrl: "https://github.com/xinntao/ESRGAN",
    hub: "qualcomm/ESRGAN",
    hubUrl: "https://huggingface.co/qualcomm/ESRGAN",
    quality: 7.5,
    seconds: 5,
    artifacts: "Moderate",
    bestFor: "Clean, synthetic images",
    strengths: "Fine detail, sharp output, fast",
    weakness: "Artifacts on compressed / noisy scans",
    batchRecipe: false,
    search: "ESRGAN",
  },
  {
    id: "real-esrgan",
    name: "Real-ESRGAN",
    year: 2021,
    paper: "Real-ESRGAN: Training Real-World Blind Super-Resolution",
    arxiv: "2107.10833",
    paperUrl: "https://arxiv.org/abs/2107.10833",
    github: "xinntao/Real-ESRGAN",
    githubUrl: "https://github.com/xinntao/Real-ESRGAN",
    hub: "hlky/RealESRGAN_x2plus",
    hubUrl: "https://huggingface.co/hlky/RealESRGAN_x2plus",
    quality: 9.2,
    seconds: 6,
    artifacts: "Minimal",
    bestFor: "Real-world photographs / card scans",
    strengths: "Trained on degraded images, stable, industry default",
    weakness: "Transformer families beat it on PSNR",
    batchRecipe: true,
    search: "Real-ESRGAN",
  },
  {
    id: "swinir",
    name: "SwinIR",
    year: 2021,
    paper: "SwinIR: Image Restoration Using Swin Transformer",
    arxiv: "2108.10257",
    paperUrl: "https://arxiv.org/abs/2108.10257",
    github: "JingyunLiang/SwinIR",
    githubUrl: "https://github.com/JingyunLiang/SwinIR",
    hub: "valhalla/SwinIR-real-sr-L-x4-GAN",
    hubUrl: "https://huggingface.co/valhalla/SwinIR-real-sr-L-x4-GAN",
    quality: 9.7,
    seconds: 12,
    artifacts: "Very minimal",
    bestFor: "All-purpose upscaling",
    strengths: "Shifted-window attention, SR + denoise + JPEG",
    weakness: "Slower (~2× Real-ESRGAN)",
    batchRecipe: false,
    search: "SwinIR",
  },
  {
    id: "lfesr",
    name: "LFESR",
    year: 2025,
    paper: "Local feature enhancement transformer for image super-resolution",
    paperUrl: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12215049/",
    github: null,
    githubUrl: null,
    hub: null,
    hubUrl: null,
    quality: null,
    seconds: null,
    artifacts: "Paper: below SwinIR / ELAN",
    bestFor: "Line and texture retention",
    strengths: "Dense local features, Urban100 / Manga109 PSNR",
    weakness: "No Hub weights published yet",
    batchRecipe: false,
    search: "SwinIR",
  },
];
