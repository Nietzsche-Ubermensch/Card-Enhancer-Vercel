import { useState } from "react";
import { Download, Loader2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { analyzeCard } from "@/lib/ai";
import { urlToJpegBase64 } from "@/lib/image-encode";
import { downloadUrl } from "@/lib/utils";
import type { QueuedCard } from "@/lib/batch-store";

type Props = {
  card: QueuedCard;
  onClose: () => void;
  onPatch: (patch: Partial<QueuedCard>) => void;
};

export function BatchInspect({ card, onClose, onPatch }: Props) {
  const [grading, setGrading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const analysis = card.analysis;

  const grade = async () => {
    setGrading(true);
    setError(null);
    try {
      const { base64, mimeType } = await urlToJpegBase64(card.processedUrl || card.previewUrl, 1280);
      const result = await analyzeCard({ data: { imageBase64: base64, mimeType } });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onPatch({ analysis: result.analysis });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Grade failed");
    } finally {
      setGrading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[min(920px,calc(100vw-1.5rem))]">
        <DialogHeader>
          <DialogTitle className="font-display text-xl uppercase truncate pr-10">{card.file.name}</DialogTitle>
          <DialogDescription>
            {card.originalWidth}×{card.originalHeight} · {card.ms ? `${card.ms} ms` : "queued"} ·{" "}
            {card.isCustomConfigured ? "custom quad" : "batch defaults"}
          </DialogDescription>
        </DialogHeader>
        <div className="grid md:grid-cols-2 gap-4 p-4 overflow-y-auto">
          <div className="space-y-2">
            <p className="micro text-subtle">Enhanced</p>
            <div className="border border-border bg-bg min-h-64 flex items-center justify-center p-2">
              <img
                src={card.processedUrl || card.previewUrl}
                alt={card.file.name}
                className="max-h-[420px] max-w-full object-contain"
              />
            </div>
          </div>
          <div className="space-y-3">
            <div className="panel p-3 space-y-2">
              <p className="micro text-subtle">Lumina grade · xAI vision</p>
              <div className="flex items-end justify-between">
                <p className="font-display text-4xl">
                  {analysis?.damageScore != null ? analysis.damageScore : "—"}
                  <span className="text-sm text-muted"> /100</span>
                </p>
                <Badge tone={analysis?.damageScore && analysis.damageScore > 75 ? "ok" : "steel"}>
                  {analysis?.gradeEstimate ?? "Ungraded"}
                </Badge>
              </div>
              {analysis?.issues && analysis.issues.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {analysis.issues.map((issue) => (
                    <Badge key={issue} tone="danger">
                      {issue}
                    </Badge>
                  ))}
                </div>
              )}
              {analysis?.recommendedFixes && analysis.recommendedFixes.length > 0 && (
                <ul className="text-xs text-muted space-y-1">
                  {analysis.recommendedFixes.map((fix) => (
                    <li key={fix}>· {fix}</li>
                  ))}
                </ul>
              )}
              {error && <p className="text-xs text-danger">{error}</p>}
              <Button size="sm" className="w-full min-h-11" onClick={() => void grade()} disabled={grading}>
                {grading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                {grading ? "Grading…" : "Grade with Lumina"}
              </Button>
            </div>
            {card.processedUrl && (
              <Button
                variant="secondary"
                className="w-full min-h-11"
                onClick={() => downloadUrl(card.processedUrl!, `enhanced_${card.file.name}`)}
              >
                <Download className="h-4 w-4" /> Download card
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
