import { createFileRoute } from "@tanstack/react-router";
import { loadPipelineSnapshot } from "@/lib/hub";
import { GIT_PIPELINE, HF_BATCH_BACKEND, OUTPUT_PRESETS } from "@/lib/sports-card";

export const Route = createFileRoute("/api/pipeline")({
  server: {
    handlers: {
      GET: async () => {
        const snap = await loadPipelineSnapshot();
        return Response.json({
          ok: true,
          protocol: {
            cli: GIT_PIPELINE.cli,
            resume: GIT_PIPELINE.resumeFlag,
            resumeFn: GIT_PIPELINE.resumeFn,
            loadFn: GIT_PIPELINE.loadFn,
            log: GIT_PIPELINE.log,
            pattern: GIT_PIPELINE.pattern,
            suffix: GIT_PIPELINE.suffix,
            scale: GIT_PIPELINE.scale,
            repo: `${GIT_PIPELINE.owner}/${GIT_PIPELINE.repo}`,
            fileUrl: GIT_PIPELINE.fileUrl,
          },
          git: snap.git,
          huggingface: {
            ...snap.hf,
            recipe: HF_BATCH_BACKEND.id,
            url: HF_BATCH_BACKEND.url,
          },
          print: OUTPUT_PRESETS,
        });
      },
    },
  },
});
