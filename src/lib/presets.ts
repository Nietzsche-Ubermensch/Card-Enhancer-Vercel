import type { CardItem, CropQuad } from "./types";
import { STANDARD_QUAD } from "./types";

type PresetKind = "vintage" | "slab" | "chrome" | "relic";

function drawPreset(kind: PresetKind): string {
  const canvas = document.createElement("canvas");
  canvas.width = 800;
  canvas.height = 1120;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  ctx.fillStyle = "#16151a";
  ctx.fillRect(0, 0, 800, 1120);
  ctx.strokeStyle = "rgba(242,242,244,0.04)";
  for (let x = 0; x < 800; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 1120);
    ctx.stroke();
  }

  const x = 90;
  const y = 110;
  const w = 620;
  const h = 900;
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 28;
  ctx.shadowOffsetY = 14;

  if (kind === "vintage") {
    ctx.fillStyle = "#efe6d4";
    ctx.fillRect(x, y, w, h);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#2a241c";
    ctx.lineWidth = 4;
    ctx.strokeRect(x + 22, y + 22, w - 44, h - 44);
    const g = ctx.createLinearGradient(x, y, x + w, y + 520);
    g.addColorStop(0, "#c4a266");
    g.addColorStop(1, "#7a5a2e");
    ctx.fillStyle = g;
    ctx.fillRect(x + 44, y + 44, w - 88, 500);
    ctx.fillStyle = "#1d3144";
    ctx.beginPath();
    ctx.arc(x + w / 2, y + 270, 150, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#efe6d4";
    ctx.font = "600 28px serif";
    ctx.textAlign = "center";
    ctx.fillText("BASE SET", x + w / 2, y + 268);
    ctx.fillStyle = "#8b2e2e";
    ctx.font = "700 42px sans-serif";
    ctx.fillText("1952 VINTAGE", x + w / 2, y + 670);
    ctx.fillStyle = "#3a342c";
    ctx.font = "500 20px sans-serif";
    ctx.fillText("OUTFIELD  ·  PAPER STOCK", x + w / 2, y + 716);
  } else if (kind === "slab") {
    ctx.fillStyle = "#e6e9ef";
    ctx.fillRect(x, y, w, h);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#8f2d2d";
    ctx.fillRect(x + 28, y + 28, w - 56, 108);
    ctx.fillStyle = "#f7f7f8";
    ctx.font = "700 26px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("GEM MINT 10", x + w / 2, y + 74);
    ctx.font = "500 14px monospace";
    ctx.fillText("SLAB  ·  HAIRLINE SAMPLE", x + w / 2, y + 108);
    ctx.fillStyle = "#171920";
    ctx.fillRect(x + 46, y + 164, w - 92, 680);
    ctx.fillStyle = "#d4d6db";
    ctx.font = "600 32px sans-serif";
    ctx.fillText("ROOKIE CARD", x + w / 2, y + 490);
    ctx.strokeStyle = "rgba(255,255,255,0.92)";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(x + 210, y + 270);
    ctx.lineTo(x + 470, y + 350);
    ctx.moveTo(x + 330, y + 410);
    ctx.lineTo(x + 350, y + 610);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + 410, y + 640, 72, 0.2, 1.8);
    ctx.stroke();
  } else if (kind === "chrome") {
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, "#c44a7a");
    g.addColorStop(0.25, "#6b3aa8");
    g.addColorStop(0.5, "#2a6f9a");
    g.addColorStop(0.75, "#3d8a5a");
    g.addColorStop(1, "#c4a266");
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#c9c4b0";
    ctx.lineWidth = 10;
    ctx.strokeRect(x + 12, y + 12, w - 24, h - 24);
    ctx.fillStyle = "#101216";
    ctx.fillRect(x + 38, y + 96, w - 76, 470);
    ctx.fillStyle = "#d4d6db";
    ctx.beginPath();
    ctx.arc(x + w / 2, y + 330, 120, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#09090b";
    ctx.font = "700 22px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("CHROME", x + w / 2, y + 338);
    ctx.fillStyle = "#09090b";
    ctx.font = "700 34px sans-serif";
    ctx.fillText("REFRACTOR /199", x + w / 2, y + 70);
    ctx.font = "600 22px sans-serif";
    ctx.fillText("PARALLEL  ·  HOLO FOIL", x + w / 2, y + 650);
  } else {
    ctx.fillStyle = "#101216";
    ctx.fillRect(x, y, w, h);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#8aa0ad";
    ctx.lineWidth = 5;
    ctx.strokeRect(x + 16, y + 16, w - 32, h - 32);
    ctx.fillStyle = "#d4d6db";
    ctx.font = "700 30px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("NEON RELIC", x + w / 2, y + 96);
    ctx.fillStyle = "#1c1c21";
    ctx.fillRect(x + 110, y + 340, w - 220, 220);
    ctx.strokeStyle = "#8aa0ad";
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 110, y + 340, w - 220, 220);
    ctx.fillStyle = "#9a9aa3";
    ctx.font = "500 16px sans-serif";
    ctx.fillText("GAME-WORN PATCH  ·  1 / 1", x + w / 2, y + 456);
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 150, y + 240);
    ctx.lineTo(x + 450, y + 280);
    ctx.moveTo(x + 200, y + 500);
    ctx.lineTo(x + 380, y + 680);
    ctx.stroke();
  }

  return canvas.toDataURL("image/png");
}

export function getPresetCards(): CardItem[] {
  const q = (): CropQuad => ({
    topLeft: { ...STANDARD_QUAD.topLeft },
    topRight: { ...STANDARD_QUAD.topRight },
    bottomRight: { ...STANDARD_QUAD.bottomRight },
    bottomLeft: { ...STANDARD_QUAD.bottomLeft },
  });
  return [
    {
      id: "preset-psa-scratch",
      name: "Graded slab (hairline)",
      originalUrl: drawPreset("slab"),
      imageElement: null,
      width: 800,
      height: 1120,
      quad: q(),
      status: "Idle",
      isPreset: true,
    },
    {
      id: "preset-vintage-mantle",
      name: "1952 vintage base",
      originalUrl: drawPreset("vintage"),
      imageElement: null,
      width: 800,
      height: 1120,
      quad: q(),
      status: "Idle",
      isPreset: true,
    },
    {
      id: "preset-holo-dragon",
      name: "Chrome refractor /199",
      originalUrl: drawPreset("chrome"),
      imageElement: null,
      width: 800,
      height: 1120,
      quad: q(),
      status: "Idle",
      isPreset: true,
    },
    {
      id: "preset-cyber-card",
      name: "Relic 1/1 Patch",
      originalUrl: drawPreset("relic"),
      imageElement: null,
      width: 800,
      height: 1120,
      quad: q(),
      status: "Idle",
      isPreset: true,
    },
  ];
}

export async function presetFiles(): Promise<File[]> {
  const presets = getPresetCards();
  const files: File[] = [];
  for (const p of presets) {
    const res = await fetch(p.originalUrl);
    const blob = await res.blob();
    const slug = p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    files.push(new File([blob], `${slug}.png`, { type: blob.type || "image/png" }));
  }
  return files;
}
