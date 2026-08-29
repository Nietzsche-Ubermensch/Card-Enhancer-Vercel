# JUG-19 · Production escalation — Card Enhancer Suite v1.0

**To:** Grok (build agent of record)  
**From:** Technical lead, eBay card pipeline  
**Repo:** `Nietzsche-Ubermensch/card-enhancer-suite` (protocol) + this TanStack Start app  
**Public URL (broken):** https://nietzsche-ubermensch.github.io/  
**Linear:** Juggintillwedie · project “Execute implementation contract for cardcrop-ai-suite”  
**Priority:** Urgent. Do not mark Done until the acceptance tests at the bottom pass against the public URL.

This is a standalone implementation package. Apply the patches. Do not re-litigate stack. Do not reintroduce Gemini FastAPI, Next `:8000`, `python main.py`, or a 9-provider AI mesh.

---

## 1. Core problem

Production is a **full-system miss**, not a single 404.

| Category | What’s live | What Linear says |
|---|---|---|
| Host | Static GitHub Pages (`Nietzsche-Ubermensch.github.io`). No Node. No Nitro. | JUG-18 closed “shipped” |
| HTTP | All 7 `/api/*` routes **404** | JUG-14 / JUG-15 / JUG-6 Done |
| Connectors | Hugging Face Hub + GitHub catalog only | JUG-11 “9 providers” Done |
| Art Studio / Lumina | Banner: “AI features are unavailable in this environment.” Controls still look armed. | JUG-5 / JUG-7 / JUG-12 Done |
| Source tree | “NO TREE AVAILABLE” / “Select a repository.” after a repo is selected | JUG-14 Done |
| Copy | MCP map lists xAI as live via `GEMINI_API_KEY` and “python main.py + Next :8000” as a live row | JUG-8 Done |

JUG-1…JUG-18 **Done is not evidence**. Treat tickets as intent. Treat screenshots + 404s as runtime.

Architecture that must be preserved:

- TanStack Start 1.x + Vite 8 + Nitro `preset: "vercel"` (`vite.config.ts`)
- WebGL batch in the **browser** (crop / descratch / ZIP / JSONL) — this part already works on Pages
- Server functions for Hub / GitHub / Linear / xAI
- Active AI provider is **xAI only** (`src/lib/ai/provider.ts` `ACTIVE_AI_PROVIDER = "xAI"`, `entitled: true`). Gemini / OpenRouter / Venice / OpenAI stay `entitled: false`.

---

## 2. Evidence (runtime, 2026-08-28)

Screenshots attached to this ticket (filenames as provided):

- `214611.png` — Batch enhancer. 4 sample tiles queued. Auto-crop / descratch / micro-dust / anti-glare / refractor / JSONL all checked. Sliders live. **This UI is the working product.** Progress `4 PENDING · 0%` until Enhance is clicked. Sample canvases are dark on electric-blue chrome (contrast defect, not an API defect).
- `214816.png` — Source. Repo list from GitHub search works (featured/catalog). Detail pane: **NO TREE AVAILABLE**, README “Select a repository.” `getGithubTree` / `getGithubReadme` are `createServerFn` POSTs; on Pages they 404, catch sets `tree = []`.
- `214831.png` — Scoring. Truth-reward math (Alex Windsor 2.381) is **client-only** and works. Not an endpoint.
- `214847.png` — Art Studio. Full prompt + 1K/2K + Generate. Banner **“AI features are unavailable in this environment.”** `getAiStatus()` serverFn failed or `available: false`.
- `214905.png` — Lumina. Same banner. Starter chips still include “1952 Mantle”.
- `214926.png` / `214944.png` — Suite landing. Gigapixel / ELAN / Card Enhancer cards. `pip install -e .` and `gigapixel-batch` CLI copy describe the **Python** repo, not this web host. Confusing next to a browser app.

Verified HTTP against the public host:

```
GET https://nietzsche-ubermensch.github.io/api/ai/status      → 404 (SPA HTML fallback)
GET https://nietzsche-ubermensch.github.io/api/pipeline       → 404
GET https://nietzsche-ubermensch.github.io/api/models         → 404
GET https://nietzsche-ubermensch.github.io/api/source         → 404
GET https://nietzsche-ubermensch.github.io/api/connectors     → 404
GET https://nietzsche-ubermensch.github.io/api/jobs           → 404
GET https://nietzsche-ubermensch.github.io/api/webhooks/linear → 404
```

Handlers **exist** in the app. They were never put on this host.

| Route file | Handler |
|---|---|
| `src/routes/api/ai/status.ts` | GET JSON `providerStatus()` |
| `src/routes/api/ai/chat.ts` | POST Lumina |
| `src/routes/api/ai/generate.ts` | POST Imagine |
| `src/routes/api/ai/analyze.ts` | POST grade |
| `src/routes/api/pipeline.ts` | GET Git + HF recipe |
| `src/routes/api/models.ts` | GET Hub search + families |
| `src/routes/api/source.ts` | GET Git tree |
| `src/routes/api/connectors.ts` | GET probe |
| `src/routes/api/jobs.ts` | GET Linear board |
| `src/routes/api/webhooks/linear.ts` | GET inbox + POST HMAC ingest |

Nitro emits them to `.vercel/output/functions/__server.func/`. GitHub Pages only uploaded `.vercel/output/static` HTML/JS/CSS. The function bundle was discarded.

Netlify site `card-enhancer-suite` (`522621a9-fef7-4d46-a025-77468ccd8c95`) failed with **“Skipped due to account credit usage exceeded.”** Do not retry a Netlify **build**. A file-only deploy still will not run `__server.func` (Vercel lambda format ≠ Netlify functions).

---

## 3. Root-cause by category

### 3.1 Backend / endpoints

**Cause:** host mismatch, not missing route files.

1. `vite.config.ts` gates `nitro({ preset: "vercel", serverDir: "./server" })` on `command === "build"`. Correct for Vercel. Irrelevant for GitHub Pages.
2. Public deploy copied SSR HTML + `/assets/*` only (see `netlify-dist/`, `Nietzsche-Ubermensch.github.io`).
3. `createServerFn` calls from the client hit `/_server/…` or `/api/…` on the Pages origin → 404 HTML.
4. `getAiStatus().catch(() => setAiOk(false))` in `src/routes/generate.tsx` and `src/routes/assistant.tsx` is why Art Studio / Lumina show the generic banner.

**Not the cause:** Zod schemas (`src/lib/ai/schemas.ts` tests pass). HMAC implementation (`src/lib/linear-webhook.ts` + `src/lib/linear-webhook.test.ts` 14/14). Missing Python process. The MCP row “python main.py + Next :8000” is a **contrast label** in `src/lib/mcp-map.ts`, not a running sidecar. Do not start FastAPI.

### 3.2 UI / design

| Symptom | Class | Cause |
|---|---|---|
| Batch 4 samples, sliders, checkboxes, 300/600/1200 dpi | Working | Client WebGL. Do not rewrite. |
| Sample tiles 01–04 crushed / dark | Frontend | Canvas presets (`src/lib/presets.ts`) sit on `#0101F2`. Raise paper fill / add a light mat. |
| Enhance 4 at 0% until click | Working | Pending queue. Copy “4 PENDING · ~1s” overpromises ETA. |
| Source “NO TREE AVAILABLE” | API-driven UI | ServerFn 404. |
| Art Studio / Lumina fully drawn + disabled | API-driven UI | `aiOk === false`. |
| Generate button visible while AI down | Frontend | Don’t hide the form; fix the banner text (3.3). |

Do not “fix” Batch by adding a Python upscaler in the browser. WebGL is the batch engine.

### 3.3 Text / messaging

| String | File | Verdict |
|---|---|---|
| “AI features are unavailable in this environment.” | `generate.tsx`, `assistant.tsx` | **Wrong.** Sounds like a product kill-switch. Real state: Pages host has no server, so `XAI_API_KEY` is unreachable. |
| MCP `gemini: "GEMINI_API_KEY"` / `ours: "xAI (server)"` / `live: true` | `mcp-map.ts` | **Misleading.** `live: true` is hardcoded. xAI is live only when `process.env.XAI_API_KEY` is set **on the Node host**. Pages: false. |
| MCP `gemini: "python main.py + Next :8000"` / `live: true` | `mcp-map.ts` | **Misleading.** This row means “we replaced that process,” not “it is running.” Set `live` on `ours: "TanStack Start"` only. |
| “Grok Imagine card art” + “billed per image” | `generate.tsx` | Accurate **when** `XAI_API_KEY` is present. On Pages, say the host cannot bill/call Imagine. |
| Starter “Should I restore a 1952 Mantle before grading?” | `assistant.tsx` | Stale Gemini sample copy. Replace. |
| Landing `pip install -e .` / `gigapixel-batch --backend gigapixel` | `src/routes/suite.tsx` / landing | Accurate for the **Python** repo. Prefix with “Desktop pipeline (Windows)” so it is not read as the web app’s install. |
| JUG-11 “9 providers” | Linear | False Done. Entitled AI = xAI. Live data = HF + GitHub. Jobs = Linear MCP (agent-side, not inbound webhook). Slack/Sheets/Gemini are catalog-only by design (`mcp-map.ts` already says Slack/Sheets not wired). |

### 3.4 Systemic Linear disconnect

Done stamps tracked **code landing in the sandbox**, not **production HTTP**. JUG-18 correctly named the gap, then was closed when Pages went 200 for HTML. HTML 200 ≠ API 200.

Re-open **JUG-18** or keep this JUG-19 as the production gate. Do not close until §5 is green on the **public** origin.

---

## 4. What “fixed” looks like (acceptance)

Run these against whichever origin you publish (must be a host that executes Nitro **or** a documented shim that returns the same JSON). Paste the curl log in the Linear comment.

```bash
BASE=https://<production-origin>

for p in /api/ai/status /api/pipeline /api/models /api/source /api/connectors /api/jobs /api/webhooks/linear; do
  echo -n "$p "
  curl -sS -o /tmp/body.json -w '%{http_code} %{content_type}\n' "$BASE$p"
  python3 -c "import json,sys; json.load(open('/tmp/body.json'))" 
done
```

| # | Criterion | Pass |
|---|---|---|
| A1 | All 7 GET endpoints **200** + `Content-Type: application/json` + `ok: true` | |
| A2 | `GET /api/ai/status` → `provider: "xAI"`. `keys.xAI` true **only** if `XAI_API_KEY` is set on that host. Never report Gemini as active. | |
| A3 | `GET /api/models` includes families ESRGAN / Real-ESRGAN / SwinIR / LFESR and recipe `hlky/RealESRGAN_x2plus` | |
| A4 | `GET /api/source?owner=Nietzsche-Ubermensch&repo=card-enhancer-suite` returns a non-empty `tree` including `gigapixel/batch.py` | |
| A5 | `GET /api/pipeline` returns `protocol.resumeFn: "process_directory_resume"` | |
| A6 | `GET /api/connectors` rows: Hugging Face `live` or `protocol`; GitHub `live` or `protocol`; xAI `entitled` or `missing` (not “9 live”) | |
| A7 | `GET /api/webhooks/linear` returns `contract` (HMAC required iff `LINEAR_WEBHOOK_SECRET` set). POST without sig → 401/400, not 404 | |
| A8 | Art Studio: if no key, banner is the specific string in §6.3 — not “unavailable in this environment.” If key present, Generate returns an image URL/data | |
| A9 | Lumina: same. Starter chips have **no** “Mantle” | |
| A10 | Source detail pane shows tree + README for `card-enhancer-suite` without “NO TREE AVAILABLE” | |
| A11 | MCP map does **not** claim xAI live on a host without `XAI_API_KEY`; does **not** claim python/Next is running | |
| A12 | Batch: load 4 samples → Enhance 4 → 4/4 Completed, ZIP contains `enhancement_log.jsonl` + `manifest.json` | |
| A13 | Linear: this issue stays In Progress until A1–A12 are commented with curl/screenshots. Then Done. | |

**Do not** satisfy A1 by returning HTML. **Do not** wire Gemini/OpenRouter/Venice/OpenAI as generation backends. Keys for those providers, if present, are catalog-only (`entitled: false`).

**Do** set on the Node host:

```
XAI_API_KEY=           # required for Lumina + Art Studio
HF_TOKEN=              # optional, Hub rate limit
GITHUB_TOKEN=          # optional, GitHub rate limit
LINEAR_API_KEY=        # optional, live JUG board
LINEAR_WEBHOOK_SECRET= # optional; if set, HMAC is required
```

If a key is missing, the JSON must say `missing` / `available: false` with the env **name**, not a generic kill message.

---

## 5. Ordered remediation (execute in order)

### Step 0 — Stop treating Pages HTML as production API

GitHub Pages cannot run `.vercel/output/functions/__server.func`. Keep Pages as a **static demo** of Batch/Scoring **or** replace it. The API host must be Nitro.

### Step 1 — Publish Nitro to a Node host (primary fix)

This workspace already builds Vercel output:

```bash
npm run build   # emits .vercel/output/static + functions/__server.func
```

**Preferred:** Grok App Builder / Vercel (already `nitro({ preset: "vercel" })`). Set env vars in the platform UI. Do not change the preset.

**If Vercel is not injectable from this sandbox**, use Cloudflare Workers with the same handlers (do not rewrite them to FastAPI).

Do **not** `npx @netlify/mcp` build — account credits exceeded. File-only Netlify still will not execute Vercel lambdas.

After deploy, run the curl block in §4 against the new origin. Put that origin in Linear and in `Nietzsche-Ubermensch.github.io` README as “API origin”.

### Step 2 — Point the static site at the API origin (if Pages stays)

Add to the client a single base (no secrets):

```ts
// src/lib/api-origin.ts
export function apiOrigin(): string {
  const explicit = import.meta.env.VITE_API_ORIGIN;
  if (explicit) return explicit.replace(/\/$/, "");
  if (typeof window !== "undefined" && !window.location.hostname.endsWith("github.io")) {
    return "";
  }
  return "";
}
```

Only set `VITE_API_ORIGIN` if you actually published Step 1. An empty origin keeps same-origin (correct on Vercel/Grok preview).

### Step 3 — Copy patches (apply even if Step 1 slips)

**`src/routes/generate.tsx` and `src/routes/assistant.tsx`** — replace the banner:

```tsx
{!aiOk && (
  <p className="text-sm text-warn panel p-3">
    Lumina / Imagine run on the server with <span className="font-mono">XAI_API_KEY</span>.
    This page has no Node process, so generation is offline. Batch enhance (WebGL) still runs in the browser.
  </p>
)}
```

**`src/routes/assistant.tsx` starters** — delete Mantle:

```ts
const STARTERS = [
  "How do I judge centering on a 2.5×3.5 slab?",
  "What's the difference between a hairline scratch and print line?",
  "When does descratch cross into restoration that a grader will flag?",
];
```

**`src/lib/mcp-map.ts`** — replace the file with:

```ts
/** Gemini local recipe vs this suite. `live` must match runtime, not intent. */
export const MCP_MAP = [
  {
    gemini: "JIRA_MCP_URL :8081",
    ours: "Linear MCP",
    live: true,
    note: "Juggintillwedie · JUG board. Agent-side. Inbound webhook is /api/webhooks/linear on the Node host only.",
  },
  {
    gemini: "SLACK_MCP_URL :8082",
    ours: "—",
    live: false,
    note: "Not a Slack app. Catalog only.",
  },
  {
    gemini: "GITHUB_MCP_URL :8083",
    ours: "GitHub MCP",
    live: true,
    note: "Nietzsche-Ubermensch/card-enhancer-suite · gigapixel/batch.py",
  },
  {
    gemini: "SHEETS_MCP_URL :8084",
    ours: "—",
    live: false,
    note: "ZIP manifest JSON/CSV. No Sheets server.",
  },
  {
    gemini: "GEMINI_API_KEY",
    ours: "xAI (server)",
    live: false,
    note: "Entitled provider is xAI via XAI_API_KEY on Nitro. Not Gemini. live flips true only when /api/ai/status.keys.xAI is true.",
  },
  {
    gemini: "python main.py + Next :8000",
    ours: "TanStack Start + Nitro",
    live: true,
    note: "Replacement, not a sidecar. One Node process. WebGL batch in the browser. No pip.",
  },
] as const;
```

Jobs UI that renders `MCP_MAP` must set xAI `live` from `/api/ai/status` when that GET is 200.

### Step 4 — Source tree on a static host (Pages band-aid)

`getGithubTree` is a serverFn. On Pages it dies. Add a **client** fallback that does not need CORS-on-api.github.com:

```ts
// src/lib/hub-client.ts
export async function loadGithubTreePublic(owner: string, repo: string, branch = "main") {
  const url = `https://data.jsdelivr.com/v1/packages/gh/${owner}/${repo}@${branch}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return { ok: false as const, error: `jsDelivr ${res.status}` };
  const body = (await res.json()) as { files?: { name: string; type?: string; hash?: string }[] };
  const tree = (body.files ?? []).map((f) => ({
    path: f.name,
    type: (f.name.endsWith("/") ? "tree" : "blob") as "tree" | "blob",
  }));
  return { ok: true as const, source: "jsdelivr" as const, tree, fileCount: tree.length };
}

export async function loadGithubReadmePublic(owner: string, repo: string, branch = "main") {
  const url = `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${branch}/README.md`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return { ok: false as const, error: `jsDelivr ${res.status}` };
  return { ok: true as const, text: (await res.text()).slice(0, 12000) };
}
```

In `src/routes/source.tsx` `useEffect` on `selected.full_name`:

```ts
Promise.all([
  getGithubReadme({ data: { owner, repo } }).catch(() => loadGithubReadmePublic(owner, repo)),
  getGithubTree({ data: { owner, repo } }).catch(() => loadGithubTreePublic(owner, repo)),
])
```

Normalize the two shapes before `setTree` / `setReadme`. Empty tree is a failure; do not show “Select a repository.” when `selected` is set — show the error string.

### Step 5 — Sample-tile contrast (UI)

In `src/lib/presets.ts` `drawPreset`: fill the desk/margin with `#d7dce8` (not the page blue showing through a near-black canvas). Keep card art. This is cosmetic; do it after API.

### Step 6 — Webhook e2e (only on the Node host)

1. Set `LINEAR_WEBHOOK_SECRET` on Nitro.
2. Linear workspace → webhook URL `https://<api-origin>/api/webhooks/linear`, resource Types `Issue`, `Comment`.
3. Replay via existing `src/routes/api/webhooks/linear.replay.ts` (dev) or POST a signed fixture (`src/lib/linear-webhook.test.ts` already has the HMAC contract).
4. `GET /api/webhooks/linear` must list the delivery. HMAC is **required for inbound Linear**, not for GitHub MCP ↔ Linear (those are separate agent connections). Do not tell the user they must HMAC the GitHub MCP.

### Step 7 — Linear hygiene

- Re-open JUG-18 or leave JUG-19 open until A1–A13 pass.
- Comment JUG-11: “9 providers” overclaim. Entitled AI = xAI. Live HTTP = HF + GitHub. Slack/Sheets/Gemini not in scope.
- Do not close JUG-14 until A3–A5 pass on the public API origin.

---

## 6. Open questions (and the guess if unanswered)

| Q | If unanswered, do this |
|---|---|
| Which production origin is canonical? | Grok/Vercel Nitro. Pages stays a static Batch demo. Dual-origin is OK if README says so. |
| How are env vars injected? | Platform project env. Never `VITE_XAI_API_KEY`. Never localStorage (JUG-5). |
| Can Netlify be used? | No, until credits restore. Even then, need `preset: "netlify"` **or** `@netlify/vite-plugin-tanstack-start` — that **conflicts** with the Vercel preset required by App Builder. Do not swap the preset. |
| Are Gemini/OpenAI keys supposed to generate images? | No. Catalog only. xAI is the entitled generator. |
| Must inbound Linear webhooks work on github.io? | Impossible. Webhook URL must be the Nitro origin. |
| Is GH_TOKEN on Pages usable? | No. Client bundles must not embed it. jsDelivr for public trees. |

---

## 7. What you must not do

- Do not scaffold FastAPI / Next / four SSE MCP ports.
- Do not read `GEMINI_API_KEY` for Lumina.
- Do not put secrets in `VITE_*` or the GitHub Pages repo.
- Do not declare Linear Done from a sandbox typecheck.
- Do not “fix” 404s by catching them and drawing an empty tree with no error.
- Do not retry Netlify MCP build.

---

## 8. Immediate command list

```bash
# 1. Production Nitro (Vercel / App Builder)
npm run build
# confirm:
test -d .vercel/output/functions/__server.func
test -f .vercel/output/static/assets/index-*.js

# 2. After origin is live
curl -sS "$API/api/ai/status" | python3 -m json.tool
curl -sS "$API/api/source?owner=Nietzsche-Ubermensch&repo=card-enhancer-suite" | python3 -c "import json,sys; d=json.load(sys.stdin); assert d.get('fileCount',0)>0"

# 3. Batch (browser): 4 samples → Enhance 4 → ZIP has enhancement_log.jsonl

# 4. Comment JUG-19 with origin + curl + screenshot of Art Studio banner (specific copy or a real image)
```

Handlers to leave in place (already correct):

- `src/routes/api/ai/status.ts`
- `src/routes/api/pipeline.ts`
- `src/routes/api/models.ts`
- `src/routes/api/source.ts`
- `src/routes/api/connectors.ts`
- `src/routes/api/jobs.ts`
- `src/routes/api/webhooks/linear.ts`
- `src/lib/ai/xai.ts` (grok-4.5 / grok-imagine-image-quality)
- `src/lib/linear-webhook.ts`

The gap is **host + copy + Source fallback**, not missing route source.

---

## 9. Sign-off

Grok: apply Steps 1–4 in this file, paste curl against the public API origin on this issue, then move JUG-19 to Done. If Step 1 cannot get a Nitro URL, say so in one sentence and still ship Steps 3–4 to github.io so the banner and Source tree stop lying.
