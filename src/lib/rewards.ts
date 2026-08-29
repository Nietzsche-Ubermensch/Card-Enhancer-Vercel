export type CardMetadata = {
  subjectName: string;
  cardNumber: string;
  manufacturer: string;
  year: string;
  stats: string;
};

export const EMPTY_METADATA: CardMetadata = {
  subjectName: "",
  cardNumber: "",
  manufacturer: "",
  year: "",
  stats: "",
};

export const FIELD_WEIGHTS = [
  { key: "subjectName" as const, label: "Subject name", weight: 0.3 },
  { key: "cardNumber" as const, label: "Card number", weight: 0.2 },
  { key: "manufacturer" as const, label: "Manufacturer", weight: 0.2 },
  { key: "year" as const, label: "Year", weight: 0.15 },
  { key: "stats" as const, label: "Stats", weight: 0.15 },
];

export function calculateTruthReward(tStar: number): number {
  if (tStar < 0) return Math.tanh(tStar) + 2.0;
  return 1.5 + 1.0 / (1.0 + Math.exp(-tStar));
}

export function qualityScoreFromMetadata(metadata: CardMetadata): {
  raw: number;
  tStar: number;
  reward: number;
  filled: { key: keyof CardMetadata; weight: number }[];
} {
  let raw = 0;
  const filled: { key: keyof CardMetadata; weight: number }[] = [];
  for (const field of FIELD_WEIGHTS) {
    if (metadata[field.key].trim()) {
      raw += field.weight;
      filled.push({ key: field.key, weight: field.weight });
    }
  }
  const tStar = (raw - 0.5) * 4.0;
  return { raw, tStar, reward: calculateTruthReward(tStar), filled };
}
