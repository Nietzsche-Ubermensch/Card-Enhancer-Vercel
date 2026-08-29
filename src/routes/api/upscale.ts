import { createFileRoute } from "@tanstack/react-router";
import { realesrganContract, runRealEsrgan } from "@/lib/realesrgan";

export const Route = createFileRoute("/api/upscale")({
  server: {
    handlers: {
      GET: async () => Response.json(realesrganContract()),
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => null)) as { image?: unknown } | null;
        if (!body || typeof body.image !== "string") {
          return Response.json({ ok: false, error: "JSON { image: data URL } required" }, { status: 400 });
        }
        const result = await runRealEsrgan(body.image);
        if (!result.ok) {
          return Response.json({ ok: false, error: result.error, model: realesrganContract().model }, { status: result.status });
        }
        return Response.json({
          ok: true,
          image: result.image,
          model: result.model,
          scale: result.scale,
          bytes: result.bytes,
        });
      },
    },
  },
});
