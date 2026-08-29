import { createFileRoute } from "@tanstack/react-router";
import { githubQuerySchema, zodErrorMessage } from "@/lib/ai/schemas";
import { loadGithubTree } from "@/lib/hub";
import { GIT_PIPELINE } from "@/lib/sports-card";

export const Route = createFileRoute("/api/source")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const parsed = githubQuerySchema.safeParse({
          owner: url.searchParams.get("owner") ?? undefined,
          repo: url.searchParams.get("repo") ?? undefined,
        });
        if (!parsed.success) {
          return Response.json({ ok: false, error: zodErrorMessage(parsed.error) }, { status: 400 });
        }
        const tree = await loadGithubTree(parsed.data.owner, parsed.data.repo);
        return Response.json({
          ok: tree.ok,
          owner: parsed.data.owner,
          repo: parsed.data.repo,
          protocol: {
            cli: GIT_PIPELINE.cli,
            resume: GIT_PIPELINE.resumeFlag,
            resumeFn: GIT_PIPELINE.resumeFn,
            loadFn: GIT_PIPELINE.loadFn,
            log: GIT_PIPELINE.log,
          },
          ...(tree.ok
            ? { source: tree.source, tree: tree.tree, fileCount: tree.fileCount }
            : { error: tree.error }),
        });
      },
    },
  },
});
