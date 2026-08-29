/** Browser-safe GitHub fallbacks for static hosts (GitHub Pages). No secrets. */

export type PublicTreeEntry = { path: string; type: "blob" | "tree"; size?: number };

export async function loadGithubTreePublic(owner: string, repo: string, branch = "main") {
  const url = `https://data.jsdelivr.com/v1/packages/gh/${owner}/${repo}@${branch}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { ok: false as const, error: `jsDelivr ${res.status}` };
    const body = (await res.json()) as {
      files?: { name: string; type?: string }[];
    };
    const tree: PublicTreeEntry[] = (body.files ?? [])
      .filter((f) => f.name)
      .map((f) => ({
        path: f.name.replace(/^\//, ""),
        type: f.type === "directory" || f.name.endsWith("/") ? "tree" : "blob",
      }));
    return { ok: true as const, source: "jsdelivr" as const, tree, fileCount: tree.length };
  } catch {
    return { ok: false as const, error: "Could not load tree from jsDelivr" };
  }
}

export async function loadGithubReadmePublic(owner: string, repo: string, branch = "main") {
  const url = `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${branch}/README.md`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { ok: false as const, error: `jsDelivr ${res.status}` };
    return { ok: true as const, text: (await res.text()).slice(0, 12000) };
  } catch {
    return { ok: false as const, error: "Could not load README from jsDelivr" };
  }
}
