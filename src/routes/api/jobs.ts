import { createFileRoute } from "@tanstack/react-router";
import { loadLinearJobs } from "@/lib/linear-jobs";

export const Route = createFileRoute("/api/jobs")({
  server: {
    handlers: {
      GET: async () => {
        const jobs = await loadLinearJobs();
        return Response.json({ ok: true, ...jobs });
      },
    },
  },
});
