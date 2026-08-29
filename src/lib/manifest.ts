import type { BatchSettings, CropQuad } from "@/lib/types";
import type { QueuedCard } from "@/lib/batch-store";
import { GIT_PIPELINE, HF_BATCH_BACKEND, type OutputDpi } from "@/lib/sports-card";
import { LINEAR_BOARD } from "@/lib/linear-board";

function gradeFromScore(score: number | undefined) {
  if (score == null) return "Ungraded";
  if (score > 90) return "PSA 9-10 (Gem Mint)";
  if (score > 75) return "PSA 7-8 (Near Mint)";
  if (score > 50) return "PSA 5-6 (Excellent)";
  return "PSA 1-4 (Fair/Poor)";
}

function quadBox(quad?: CropQuad) {
  if (!quad) return [0, 0, 1, 1] as const;
  const xs = [quad.topLeft.x, quad.topRight.x, quad.bottomRight.x, quad.bottomLeft.x];
  const ys = [quad.topLeft.y, quad.topRight.y, quad.bottomRight.y, quad.bottomLeft.y];
  return [Math.min(...ys), Math.min(...xs), Math.max(...ys), Math.max(...xs)] as const;
}

function csvCell(val: unknown) {
  const str = val == null ? "" : String(val).replace(/"/g, '""');
  return `"${str}"`;
}

export type ManifestContext = {
  dpi: OutputDpi;
  settings: BatchSettings;
  gitSource?: string;
  hfSource?: string;
};

export function cardManifestRow(card: QueuedCard, ctx: ManifestContext) {
  const box = card.analysis?.boundingBox ?? quadBox(card.quad);
  const [ymin, xmin, ymax, xmax] = box;
  const cropW = card.originalWidth ? Math.round((xmax - xmin) * card.originalWidth) : 0;
  const cropH = card.originalHeight ? Math.round((ymax - ymin) * card.originalHeight) : 0;
  const score = card.analysis?.damageScore;
  const landscape = (card.originalWidth || 0) > (card.originalHeight || 0);
  return {
    cardId: card.id,
    fileName: card.file.name,
    fileSize: card.file.size,
    mimeType: card.file.type,
    status: card.status,
    ms: card.ms ?? null,
    error: card.error ?? null,
    override: Boolean(card.isCustomConfigured),
    rotation: card.rotation ?? 0,
    originalDimensions: {
      width: card.originalWidth,
      height: card.originalHeight,
      aspectRatio:
        card.originalWidth && card.originalHeight
          ? +(card.originalWidth / card.originalHeight).toFixed(3)
          : landscape
            ? 1.4
            : 0.714,
    },
    print: {
      orientation: landscape ? "landscape" : "portrait",
      inches: landscape ? "3.5x2.5" : "2.5x3.5",
      dpi: ctx.dpi,
    },
    cropCoordinates: {
      ymin: +ymin.toFixed(4),
      xmin: +xmin.toFixed(4),
      ymax: +ymax.toFixed(4),
      xmax: +xmax.toFixed(4),
      croppedPixelWidth: cropW,
      croppedPixelHeight: cropH,
      quad: card.quad ?? null,
    },
    aiAnalysis: card.analysis
      ? {
          damageScore: score,
          gradeEstimate: card.analysis.gradeEstimate || gradeFromScore(score),
          issuesIdentified: card.analysis.issues,
          detailedDefects: card.analysis.detailedIssues ?? [],
          recommendedFixes: card.analysis.recommendedFixes,
        }
      : null,
  };
}

export function buildManifestJson(cards: QueuedCard[], ctx: ManifestContext) {
  return {
    backend: "webgl",
    protocol: "gigapixel-batch",
    git: {
      repo: `${GIT_PIPELINE.owner}/${GIT_PIPELINE.repo}`,
      cli: GIT_PIPELINE.cli,
      resume: GIT_PIPELINE.resumeFlag,
      source: ctx.gitSource ?? "protocol",
    },
    huggingface: {
      id: HF_BATCH_BACKEND.id,
      className: HF_BATCH_BACKEND.className,
      scale: HF_BATCH_BACKEND.scale,
      source: ctx.hfSource ?? "recipe",
    },
    linear: {
      team: LINEAR_BOARD.teamKey,
      project: LINEAR_BOARD.project,
      url: LINEAR_BOARD.projectUrl,
    },
    wolfram: { portraitIn: "2.5x3.5", landscapeIn: "3.5x2.5", dpi: ctx.dpi },
    settings: ctx.settings,
    count: cards.length,
    completed: cards.filter((c) => c.status === "Completed").length,
    failed: cards.filter((c) => c.status === "Failed").length,
    exportedAt: new Date().toISOString(),
    cards: cards.map((c) => cardManifestRow(c, ctx)),
  };
}

export function buildManifestCsv(cards: QueuedCard[], ctx: ManifestContext) {
  const headers = [
    "Card_ID",
    "File_Name",
    "Status",
    "Original_Width_PX",
    "Original_Height_PX",
    "Orientation",
    "Crop_YMin",
    "Crop_XMin",
    "Crop_YMax",
    "Crop_XMax",
    "Damage_Score",
    "Grade_Estimate",
    "Issues_Identified",
    "Recommended_Fixes",
    "Override",
    "Rotation",
    "Ms",
    "HF_Recipe",
    "Git_CLI",
    "DPI",
    "Exported_Timestamp",
  ];
  const rows = cards.map((card) => {
    const row = cardManifestRow(card, ctx);
    return [
      csvCell(row.cardId),
      csvCell(row.fileName),
      csvCell(row.status),
      row.originalDimensions.width || 0,
      row.originalDimensions.height || 0,
      csvCell(row.print.orientation),
      row.cropCoordinates.ymin,
      row.cropCoordinates.xmin,
      row.cropCoordinates.ymax,
      row.cropCoordinates.xmax,
      row.aiAnalysis?.damageScore ?? "",
      csvCell(row.aiAnalysis?.gradeEstimate ?? "Ungraded"),
      csvCell((row.aiAnalysis?.issuesIdentified ?? []).join("; ")),
      csvCell((row.aiAnalysis?.recommendedFixes ?? []).join("; ")),
      row.override ? "Yes" : "No",
      row.rotation,
      row.ms ?? "",
      csvCell(HF_BATCH_BACKEND.id),
      csvCell(GIT_PIPELINE.cli),
      ctx.dpi,
      csvCell(new Date().toISOString()),
    ].join(",");
  });
  return [headers.join(","), ...rows].join("\n");
}
