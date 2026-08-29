import type { AnalysisResult } from "@/lib/types";
import { Badge } from "@/components/ui/badge";

export function GradePanel({ analysis }: { analysis: AnalysisResult }) {
  const tone = analysis.damageScore >= 90 ? "ok" : analysis.damageScore >= 70 ? "warn" : "danger";
  return (
    <div className="panel p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold tracking-wide">Lumina grade</h3>
        <Badge tone={tone}>{analysis.gradeEstimate ?? `${analysis.damageScore}/100`}</Badge>
      </div>
      <p className="font-mono text-2xl tracking-tight tabular-nums">{analysis.damageScore}</p>
      {analysis.issues.length > 0 && (
        <ul className="space-y-1 text-sm text-muted">
          {analysis.issues.map((issue) => (
            <li key={issue}>· {issue}</li>
          ))}
        </ul>
      )}
      {analysis.recommendedFixes.length > 0 && (
        <p className="text-xs text-subtle">{analysis.recommendedFixes.join(" · ")}</p>
      )}
    </div>
  );
}
