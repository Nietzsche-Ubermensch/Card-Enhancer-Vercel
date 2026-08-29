export interface TestCardMeta {
  fileName: string;
  year: number;
  manufacturer: string;
  cardName: string;
  cardNumber: string;
  condition: string;
  theme: "vintage" | "chrome" | "slab" | "relic";
  defectType: "scratches" | "centering_shift" | "corner_wear" | "surface_scuff" | "pristine";
}

export const TEST_CARDS_CATALOG: TestCardMeta[] = [
  { fileName: "Year-Manufacturer-Card-0193.jpg", year: 1952, manufacturer: "Topps", cardName: "Mickey Mantle Rookie", cardNumber: "#311", condition: "PSA 8 NM-MT", theme: "vintage", defectType: "centering_shift" },
  { fileName: "Year-Manufacturer-Card-0196.jpg", year: 1986, manufacturer: "Fleer", cardName: "Michael Jordan RC", cardNumber: "#57", condition: "PSA 9 MINT", theme: "slab", defectType: "scratches" },
  { fileName: "Year-Manufacturer-Card-0197.jpg", year: 1989, manufacturer: "Upper Deck", cardName: "Ken Griffey Jr.", cardNumber: "#1", condition: "Surface scuff", theme: "chrome", defectType: "surface_scuff" },
  { fileName: "Year-Manufacturer-Card-0198.jpg", year: 1993, manufacturer: "SP", cardName: "Derek Jeter Foil", cardNumber: "#279", condition: "Corner wear", theme: "chrome", defectType: "corner_wear" },
  { fileName: "Year-Manufacturer-Card-0199.jpg", year: 1996, manufacturer: "Topps Chrome", cardName: "Kobe Bryant RC", cardNumber: "#138", condition: "Pristine 10", theme: "chrome", defectType: "pristine" },
  { fileName: "Year-Manufacturer-Card-0200.jpg", year: 2000, manufacturer: "Bowman", cardName: "Tom Brady RC", cardNumber: "#236", condition: "Surface scratches", theme: "chrome", defectType: "scratches" },
  { fileName: "Year-Manufacturer-Card-0206.jpg", year: 2003, manufacturer: "Topps", cardName: "LeBron James RC", cardNumber: "#111", condition: "Gold bordered", theme: "vintage", defectType: "centering_shift" },
  { fileName: "Year-Manufacturer-Card-0209.jpg", year: 2009, manufacturer: "Topps", cardName: "Stephen Curry Draft", cardNumber: "#321", condition: "BGS 9.5", theme: "slab", defectType: "surface_scuff" },
  { fileName: "Year-Manufacturer-Card-0212.jpg", year: 2011, manufacturer: "Topps Update", cardName: "Mike Trout", cardNumber: "#US175", condition: "PSA 10", theme: "vintage", defectType: "pristine" },
  { fileName: "Year-Manufacturer-Card-0214.jpg", year: 2018, manufacturer: "Topps", cardName: "Shohei Ohtani Dual", cardNumber: "#SO-17", condition: "Chrome", theme: "chrome", defectType: "scratches" },
  { fileName: "Year-Manufacturer-Card-0230.jpg", year: 2020, manufacturer: "National Treasures", cardName: "Patrick Mahomes Patch", cardNumber: "#NT-15", condition: "1/1 relic", theme: "relic", defectType: "surface_scuff" },
  { fileName: "Year-Manufacturer-Card-0232.jpg", year: 2023, manufacturer: "Panini", cardName: "Victor Wembanyama", cardNumber: "#VW-01", condition: "SuperFractor", theme: "chrome", defectType: "pristine" },
];

const EXTRA_NAMES = [
  "Babe Ruth", "Willie Mays", "Hank Aaron", "Ted Williams", "Sandy Koufax",
  "Magic Johnson", "Larry Bird", "Shaquille O'Neal", "Tim Duncan", "Kevin Durant",
  "Joe Montana", "Jerry Rice", "Peyton Manning", "Lawrence Taylor", "Barry Sanders",
  "Wayne Gretzky", "Mario Lemieux", "Sidney Crosby", "Connor McDavid", "Alex Ovechkin",
  "Ichiro Suzuki", "Cal Ripken", "Nolan Ryan", "Randy Johnson", "Pedro Martinez",
  "Giannis Antetokounmpo", "Nikola Jokic", "Luka Doncic", "Jayson Tatum", "Ja Morant",
  "Josh Allen", "Justin Jefferson", "CeeDee Lamb", "Travis Kelce", "Saquon Barkley",
  "Shohei Ohtani", "Ronald Acuna", "Juan Soto", "Aaron Judge", "Mookie Betts",
  "Paul Skenes", "Elly De La Cruz", "Jackson Holliday", "Wyatt Langford", "Junior Caminero",
  "Caitlin Clark", "Aja Wilson", "Sabrina Ionescu", "Breanna Stewart", "Napheesa Collier",
];

function metaAt(i: number): TestCardMeta {
  const base = TEST_CARDS_CATALOG[i % TEST_CARDS_CATALOG.length];
  const name = i < TEST_CARDS_CATALOG.length ? base.cardName : EXTRA_NAMES[(i - TEST_CARDS_CATALOG.length) % EXTRA_NAMES.length];
  return {
    ...base,
    cardName: name,
    year: base.year + Math.floor(i / TEST_CARDS_CATALOG.length),
    cardNumber: `#${String((i % 99) + 1).padStart(3, "0")}`,
    fileName: `sport-card-${String(i + 1).padStart(3, "0")}-${name.replace(/[^A-Za-z0-9]+/g, "_")}.jpg`,
  };
}

export function generateTestCardCanvas(meta: TestCardMeta): HTMLCanvasElement {
  const W = 400;
  const H = 560;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  ctx.fillStyle = "#121216";
  ctx.fillRect(0, 0, W, H);

  let x = 40;
  let y = 48;
  if (meta.defectType === "centering_shift") {
    x += 10;
    y -= 6;
  }
  const w = 320;
  const h = 448;
  const cx = x + w / 2;
  ctx.textAlign = "center";

  if (meta.theme === "vintage") {
    ctx.fillStyle = "#efe6d4";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "#2a241c";
    ctx.lineWidth = 4;
    ctx.strokeRect(x + 12, y + 12, w - 24, h - 24);
    ctx.fillStyle = "#7a5a2e";
    ctx.fillRect(x + 24, y + 24, w - 48, 220);
    ctx.fillStyle = "#1d3144";
    ctx.beginPath();
    ctx.arc(cx, y + 130, 70, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#efe6d4";
    ctx.font = "600 13px serif";
    ctx.fillText(`${meta.year} ${meta.manufacturer.toUpperCase()}`, cx, y + 52);
    ctx.fillStyle = "#8b2e2e";
    ctx.font = "700 16px sans-serif";
    ctx.fillText(meta.cardName.toUpperCase().slice(0, 22), cx, y + 290);
    ctx.fillStyle = "#3a342c";
    ctx.font = "500 11px sans-serif";
    ctx.fillText(`${meta.cardNumber}  ·  HOF`, cx, y + 314);
  } else if (meta.theme === "slab") {
    ctx.fillStyle = "#e6e9ef";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "#8f2d2d";
    ctx.fillRect(x + 12, y + 12, w - 24, 52);
    ctx.fillStyle = "#f7f7f8";
    ctx.font = "700 13px sans-serif";
    ctx.fillText("PSA GEM MT 10", cx, y + 34);
    ctx.font = "500 10px monospace";
    ctx.fillText(`${meta.year} ${meta.manufacturer}`, cx, y + 50);
    ctx.fillStyle = "#171920";
    ctx.fillRect(x + 20, y + 76, w - 40, 320);
    ctx.fillStyle = "#d4d6db";
    ctx.font = "700 14px sans-serif";
    ctx.fillText(meta.cardName.toUpperCase().slice(0, 22), cx, y + 230);
    ctx.font = "500 10px monospace";
    ctx.fillText(`${meta.cardNumber}  ·  RC`, cx, y + 252);
  } else if (meta.theme === "chrome") {
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, "#8aa0ad");
    g.addColorStop(1, "#2c333a");
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "#c9c4b0";
    ctx.lineWidth = 6;
    ctx.strokeRect(x + 8, y + 8, w - 16, h - 16);
    ctx.fillStyle = "#101216";
    ctx.fillRect(x + 18, y + 48, w - 36, 230);
    ctx.fillStyle = "#f4f4f5";
    ctx.font = "700 13px sans-serif";
    ctx.fillText(meta.cardName.toUpperCase().slice(0, 22), cx, y + 34);
    ctx.fillStyle = "#d4d6db";
    ctx.font = "600 11px sans-serif";
    ctx.fillText(`${meta.manufacturer.toUpperCase()}  REFRACTOR`, cx, y + 310);
    ctx.font = "500 10px monospace";
    ctx.fillText(`${meta.cardNumber}  ·  ${meta.condition}`, cx, y + 332);
  } else {
    ctx.fillStyle = "#101216";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "#8aa0ad";
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 10, y + 10, w - 20, h - 20);
    ctx.fillStyle = "#1c1c21";
    ctx.fillRect(x + 50, y + 150, w - 100, 100);
    ctx.fillStyle = "#d4d6db";
    ctx.font = "700 14px sans-serif";
    ctx.fillText(meta.cardName.toUpperCase().slice(0, 22), cx, y + 48);
    ctx.fillStyle = "#9a9aa3";
    ctx.font = "500 10px sans-serif";
    ctx.fillText("GAME-WORN PATCH", cx, y + 200);
    ctx.fillStyle = "#d4d6db";
    ctx.font = "600 12px sans-serif";
    ctx.fillText(`${meta.year}  ·  1 OF 1`, cx, y + 330);
  }

  if (meta.defectType === "scratches") {
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x + 50, y + 110);
    ctx.lineTo(x + 220, y + 160);
    ctx.moveTo(x + 160, y + 180);
    ctx.lineTo(x + 180, y + 300);
    ctx.stroke();
  } else if (meta.defectType === "surface_scuff") {
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, y + 190, 48, 0.4, 2.8);
    ctx.stroke();
  } else if (meta.defectType === "corner_wear") {
    ctx.fillStyle = "#e8d8b8";
    ctx.fillRect(x + 10, y + 10, 16, 16);
    ctx.fillRect(x + w - 26, y + 10, 16, 16);
  }

  return canvas;
}

function canvasToFile(canvas: HTMLCanvasElement, fileName: string): Promise<File> {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(new File([blob || new Blob()], fileName, { type: "image/jpeg", lastModified: Date.now() })),
      "image/jpeg",
      0.82,
    );
  });
}

const CHUNK = 8;

export async function* generateTestCardFiles(count = 50): AsyncGenerator<File, void, unknown> {
  const target = Math.max(1, Math.min(count, 250));
  for (let start = 0; start < target; start += CHUNK) {
    const end = Math.min(start + CHUNK, target);
    const files = await Promise.all(
      Array.from({ length: end - start }, (_, k) => {
        const i = start + k;
        const meta = metaAt(i);
        return canvasToFile(generateTestCardCanvas(meta), meta.fileName);
      }),
    );
    for (const file of files) yield file;
    await new Promise((r) => setTimeout(r, 0));
  }
}

export async function createTestCardFiles(count = 50): Promise<File[]> {
  const files: File[] = [];
  for await (const file of generateTestCardFiles(count)) files.push(file);
  return files;
}
