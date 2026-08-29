import { create } from "zustand";
import { ProcessingStatus, type CardImage } from "@/lib/types";
import { MAX_BATCH } from "@/lib/sports-card";

export type QueuedCard = CardImage & {
  thumbUrl: string;
  processedBlob?: Blob;
  ms?: number;
  error?: string;
};

type BatchStore = {
  cards: QueuedCard[];
  enqueue: (incoming: QueuedCard[]) => number;
  setCards: (updater: (prev: QueuedCard[]) => QueuedCard[]) => void;
  patch: (id: string, patch: Partial<QueuedCard>) => void;
  remove: (id: string) => void;
  clear: () => void;
};

function revoke(card: QueuedCard) {
  if (card.previewUrl.startsWith("blob:")) URL.revokeObjectURL(card.previewUrl);
  if (card.thumbUrl.startsWith("blob:") && card.thumbUrl !== card.previewUrl) URL.revokeObjectURL(card.thumbUrl);
  if (card.processedUrl?.startsWith("blob:")) URL.revokeObjectURL(card.processedUrl);
}

export const useBatchStore = create<BatchStore>((set, get) => ({
  cards: [],
  enqueue: (incoming) => {
    const room = Math.max(0, MAX_BATCH - get().cards.length);
    const accepted = incoming.slice(0, room);
    if (accepted.length === 0) return 0;
    set({ cards: [...get().cards, ...accepted] });
    return accepted.length;
  },
  setCards: (updater) => set({ cards: updater(get().cards) }),
  patch: (id, patch) =>
    set({
      cards: get().cards.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }),
  remove: (id) => {
    const card = get().cards.find((c) => c.id === id);
    if (card) revoke(card);
    set({ cards: get().cards.filter((c) => c.id !== id) });
  },
  clear: () => {
    get().cards.forEach(revoke);
    set({ cards: [] });
  },
}));

const IMAGE_RE = /^image\/(jpeg|jpg|png|webp|gif|bmp|heic)?/i;

export function filesToQueuedCards(fileList: FileList | File[]): QueuedCard[] {
  const files = Array.from(fileList).filter((f) => IMAGE_RE.test(f.type) || /\.(jpe?g|png|webp|gif|bmp)$/i.test(f.name));
  return files.map((file, i) => {
    const previewUrl = URL.createObjectURL(file);
    return {
      id: `${Date.now().toString(36)}-${i}-${Math.random().toString(36).slice(2, 7)}`,
      file,
      previewUrl,
      thumbUrl: previewUrl,
      status: ProcessingStatus.Pending,
      originalWidth: 0,
      originalHeight: 0,
    };
  });
}

export { ProcessingStatus };
