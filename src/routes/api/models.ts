import { createFileRoute } from "@tanstack/react-router";
import { modelSearchSchema, zodErrorMessage } from "@/lib/ai/schemas";
import { loadHfRecipe, loadUpscalerFamilies, queryHfModels } from "@/lib/hub";

export const Route = createFileRoute("/api/models")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const parsed = modelSearchSchema.safeParse({
          query: url.searchParams.get("query") ?? undefined,
          limit: url.searchParams.get("limit") ?? undefined,
        });
        if (!parsed.success) {
          return Response.json({ ok: false, error: zodErrorMessage(parsed.error) }, { status: 400 });
        }
        const [search, recipe, families] = await Promise.all([
          queryHfModels(parsed.data),
          loadHfRecipe(),
          loadUpscalerFamilies(),
        ]);
        return Response.json({
          ok: true,
          query: parsed.data.query,
          limit: parsed.data.limit,
          source: search.source,
          models: search.models,
          recipe,
          families,
        });
      },
    },
  },
});
