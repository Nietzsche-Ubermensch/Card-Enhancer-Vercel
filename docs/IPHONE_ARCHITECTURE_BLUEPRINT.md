# Card Enhancer — iPhone Architecture Blueprint

Status: v1.0 — grounded in an audit of this repository (`Nietzsche-Ubermensch/Card-Enhancer-Vercel`)
and verified upstream model facts. Where a claim is unverified it is marked `[VERIFY]`.

Legend used throughout:

- `ON_DEVICE` — runs on iPhone in production
- `SERVER_SIDE` — runs on backend / workstation service
- `HYBRID` — split, decided per subsystem
- `UNSUITABLE_ON_DEVICE` — do not attempt on iPhone
- `[VERIFY]` — must be confirmed by measurement or license reading before shipping

---

## 1. Existing Repository Audit

What this repository ACTUALLY contains (measured, not assumed):

| Component | Path | Reality |
|---|---|---|
| React frontend | `sports-card-enhancer/app/` | Vite + React + TypeScript + shadcn/ui (full component set), axios API client, batch uploader, job monitor, WebSocket progress |
| Enhancement backend | `sports-card-enhancer/backend/` | **FastAPI (Python), not Express/Node.** Endpoints: `/upload`, `/enhance`, `/status/{job_id}`, `/download/{job_id}`, `/preview`, `/ws/{job_id}`, `/jobs/{job_id}` DELETE, `/health` |
| Super-resolution | `real_esrgan_service.py` | Real-ESRGAN (x4plus, x2plus, anime, general-x4v3), tiled inference (256px tiles), FP16, lazy weight loading |
| Defect detection | `blemish_detector.py` | **Classical OpenCV heuristics** (Canny + Hough for scratches, morphology for dust/scuffs, CLAHE) — not a learned model |
| Enhancement pipeline | `enhancement_service.py` | Ordered: blemish removal → noise reduction → color correction → contrast → sharpen → SR upscale; `preserve_holographic` flag |
| Batch jobs | `batch_processor.py` | In-memory async job queue, per-image progress, WebSocket callbacks, ZIP in/out, cancellation |
| DCPT pipeline | `backend/dcpt_pipeline/` | PyTorch graph model: 2× node-conditioned attention layers with low-rank per-node adapters, TDA-gated attention `α·σ(gate_scale·T*)`, multi-task heads (value regression + 6-class defect). Defaults: `num_nodes=10, in_features=64, hidden=128` → **sub-1M parameters**. TDA GPU acceleration is a placeholder; training data is synthetic |
| DCPT support | `backend/app/services/` | `adaptive_preprocessor.py`, `batch_processor.py`, `validation_suite.py` |
| Docs | `README.md`, `dcpt_requirements.md`, DCPT PDF/PPTX | Architecture formulas, deployment guide |

Corrections to the mission brief (facts, not opinions):

1. **There is no WebGL card-cropping code in this repository.** No crop engine exists at all — no corner detection, no perspective correction anywhere. The crop engine must be built from scratch (§6).
2. **There are no Express routes and no `/api/ai/chat|generate-image|analyze` endpoints.** The existing API is the FastAPI contract above. Versioning strategy in §13 wraps it rather than breaking it.
3. **No AI provider adapters or keys** (`GEMINI_API_KEY`, `OPENAI_API_KEY`, etc.) exist in source. The §17 security rules apply to the future backend, not to removing something present.
4. **No OCR of any kind exists yet.** PaddleOCR is greenfield.
5. **PromptIR is not integrated anywhere.** Only Real-ESRGAN is. GFPGAN appears solely as an optional pip dependency of the Real-ESRGAN stack (`gfpgan>=1.3.5`, unused in code paths).
6. **DCPT has never seen a real card image.** It consumes pre-built graph tensors; the image→graph feature extractor does not exist. This is the single largest gap between the brief and reality.

## 2. Upstream Model Audit

| Property | PaddleOCR (PP-OCRv5) | PromptIR | GFPGAN | DCPT (this repo) |
|---|---|---|---|---|
| Job | Text detection + recognition | All-in-one blind restoration | Face restoration | Valuation + defect classification on graphs |
| License | Apache-2.0 (check bundled deps: Clipper/Boost, pods) | **NoAssertion / unclear; derives from Restormer & AirNet — commercial use `[VERIFY]` before shipping** | Repo MIT/Apache mix by version; StyleGAN2-derived weights — `[VERIFY]` weight license for commercial use | Yours |
| Size | Mobile det+cls+rec ≈ 5M params (~10–20 MB total); server variants far larger | ~35M params (Restormer-class transformer), FP32 ~140 MB | GFPGANv1.4 checkpoint ~330 MB class | <1M params, KB–MB scale — but TDA feature computation dominates |
| Input | Full image / text regions | Fixed patches (128–256px), full-res needs tiling | Aligned 512×512 face crops | `[B, N=10, 64]` node features + edge_index + `T*` |
| Runtime today | Paddle Inference / Paddle Lite / **ONNX Runtime (official iOS demo path)** | PyTorch CUDA | PyTorch CUDA | PyTorch |
| ONNX export | Supported (paddle2onnx; `export_with_pir=False`) | Possible; transformer attention at dynamic shapes is fragile `[VERIFY]` | Painful — StyleGAN2 decoder + non-model post-processing must be wrapped; known community conversions exist | Trivial (small MLP/attention), but pointless without on-device TDA |
| iPhone on-device verdict | **VIABLE** (mobile models via ONNX Runtime or Core ML) — but see §6/§12: Apple Vision may beat it for Latin-script cards at zero cost | **UNSUITABLE_ON_DEVICE** for full-card, full-res (transformer, memory, thermal). Server-side only; a distilled/tiny variant is future work | **UNSUITABLE_ON_DEVICE** as default; only ever a server-side optional branch | **HYBRID** — inference could run on-device, but TDA + graph construction stay server-side, so model runs server-side too |
| Known limits | Struggles with foil glare, stylized card fonts, gold-foil serials | Trained on noise/rain/haze — **not** trained on card-relevant degradations like glare, sleeve reflection, print moiré; benefit is unproven for this domain | Hallucinates facial detail by design; must never touch condition evidence | Trained only on synthetic data; no image encoder; TDA GPU path is a stub |

Key honest finding: **Apple's Vision framework (`VNRecognizeTextRequest`) is a zero-download, ANE-accelerated, on-device OCR** that must be benchmarked head-to-head against PaddleOCR-mobile on the card test set (§20) before committing to shipping Paddle weights in the bundle. English-language sports cards are Vision's best case.

## 3. iPhone Architecture Decision

**Native SwiftUI application.** Rationale grounded in the audit:

- The heavy lifting the app needs (AVFoundation capture pipeline, Vision, Core Image, Metal, BGTaskScheduler, background URLSession, PhotoKit) is all native API surface; a wrapper framework only adds a bridge tax to every frame.
- Nothing in the repo argues for React Native: the React code is a Vite web dashboard, not Expo/RN, and shares nothing runtime-relevant with iOS.
- The web dashboard remains as-is; the iPhone app is a sibling client of the same versioned API (§13), aligned by design tokens only (§19).

Stack: SwiftUI + MVVM (`@Observable` view models), async/await, actor-isolated services, Swift Concurrency for the pipeline, SwiftData (or GRDB if migration complexity demands `[VERIFY]` during M1) for persistence.

Minimum target: iOS 17, iPhone 12 and newer (A14+, guarantees usable ANE + 4 GB RAM).

## 4. Device-vs-Cloud Matrix

| Stage | Placement | Why (constraint that decided it) |
|---|---|---|
| Camera, stabilization, quality gates | ON_DEVICE | Latency; must run per preview frame |
| Card detection + corner refinement | ON_DEVICE | Deterministic CV at preview resolution; offline requirement |
| Perspective rectification + crop | ON_DEVICE | Core Image/vImage homography is milliseconds; offline requirement |
| Display enhancement (L3: exposure/WB/sharpen) | ON_DEVICE | Core Image built-ins, no model |
| OCR (identity fields) | ON_DEVICE first (Vision), PaddleOCR-server as escalation | Vision costs 0 MB; escalate only low-confidence captures |
| PromptIR restoration | SERVER_SIDE | 35M-param transformer; thermal + RAM kill it on full-res |
| GFPGAN face branch | SERVER_SIDE, opt-in only | 330 MB weights; optional product value |
| Real-ESRGAN upscale | SERVER_SIDE | Already implemented there; tiled GPU inference |
| Defect analysis (authoritative) | SERVER_SIDE (runs on L2 upload) | Consistency of evidence; existing OpenCV detectors + future learned model |
| Graph construction + TDA + DCPT | SERVER_SIDE | TDA (persistent homology) is CPU/GPU heavy; GPU path is currently a stub |
| Valuation retrieval | SERVER_SIDE | Market data access |
| Job queue, retry, caching, history | ON_DEVICE (client state) + SERVER_SIDE (jobs) | Resumability |

These placements are the benchmarked-hypothesis defaults; §21 defines the measurements that can move a row (e.g., PaddleOCR-mobile on-device if Vision underperforms on foil/stylized fonts).

## 5. Complete Image Pipeline

Immutable lineage (every artifact stores `parent_id`, `transform`, `model`, `model_version`):

```
L0 ORIGINAL_CAPTURE        (HEIC/ProRAW as shot; never mutated, never deleted while card exists)
L1 ORIENTATION_NORMALIZED  (EXIF-applied, colorspace-normalized)
L2 PERSPECTIVE_RECTIFIED   (homography from crop engine; THE authoritative condition-evidence image)
L3 DISPLAY_ENHANCED        (Core Image exposure/WB/sharpen; UI only)
L4 PROMPTIR_RESTORED       (server; analysis-assist copy ONLY)
L5 GFPGAN_FACE_RESTORED    (server; face ROI only; display/identity ONLY)
L6 ANALYSIS_OVERLAY        (defect boxes, OCR boxes, attention maps; render layer, not evidence)
```

Branching (no image is forced through every model):

```
L0 → L1 → L2 ──┬─→ DEFECT ANALYSIS (server, on L2 ONLY — L4/L5 are banned inputs here)
               ├─→ OCR (Vision on-device on L2)
               │      └─ low confidence → server PaddleOCR on L2
               │             └─ still low + supported degradation → PromptIR(L2)=L4 → PaddleOCR(L4) → keep best, record which layer won
               ├─→ FACE ROI → (opt-in) GFPGAN = L5 → display / identity match only
               ├─→ DCPT (server: features → graph → TDA → inference)
               └─→ Real-ESRGAN / export enhancement (user-requested output, labeled ENHANCED)
```

Enforced invariants:

- `RESTORED_IMAGE != SOURCE_EVIDENCE`: the server rejects any defect/DCPT job whose input artifact layer is not L2 (schema-level check on `layer` field).
- Every ML result row stores `input_artifact_id` + `layer`, so provenance is queryable.
- OCR results from L4 are stored with `layer: L4` and displayed with an "enhanced-assisted read" badge; low-confidence OCR stays low-confidence — no silent promotion.

## 6. PaddleOCR Integration

One job: **text detection + recognition** for card identity fields (name, set, number, year, player, manufacturer, edition, serials). Explicitly banned uses: grading, valuation, crop geometry, restoration.

- Tiered strategy:
  - Tier 1 ON_DEVICE: Apple Vision `VNRecognizeTextRequest` (accurate mode, language `en-US`) on L2 regions. Free, ANE-accelerated, no bundle cost.
  - Tier 2 SERVER: PP-OCRv5 server det+rec via ONNX Runtime GPU on L2 full card + region crops.
  - Tier 3 SERVER: PP-OCRv5 on L4 (PromptIR-assisted retry) — only when Tier 2 confidence < threshold AND degradation estimator says the image has a PromptIR-supported degradation.
  - Optional Tier 1b `[BENCHMARK-GATED]`: PP-OCRv5-mobile converted to Core ML/ONNX Runtime iOS (~10–20 MB) — ship only if §20 matrix shows it beats Vision on the card fixture set by a material margin.
- Region selection: card-type-aware templates (name plate, set line, number corner, copyright line) computed on L2; whole-card OCR as fallback.
- Stored per read: `raw_text, normalized_text, bounding_box, confidence, language, engine (vision|paddle_server|paddle_mobile), input_layer, model_version`.
- Identity resolution: normalized OCR → card database candidate match with its own score. `OCR_OUTPUT != VERIFIED_CARD_IDENTITY`; UI always shows match confidence and offers manual override.

FAILURE MODE: no text found / garbage reads on foil. FALLBACK: region retry → server tier → PromptIR-assist tier → manual entry. ACCEPTANCE: ≥90% top-1 card identification on the §20 fixture set for non-foil modern cards; measured (not assumed) numbers recorded for foil.

## 7. PromptIR Integration

One job: **restoration to improve machine readability**, on an analysis copy (L4). Never the evidence path.

- SERVER_SIDE only. Restormer-class ~35M-param transformer; tiled inference for full cards.
- Gate before running: a cheap degradation estimator (Laplacian blur score, noise σ estimate, haze/low-light heuristics from existing `image_utils`) decides whether the image exhibits a degradation PromptIR was actually trained on (noise, rain, haze — verified). Glare and sleeve reflections are NOT in its training set; do not run it for those.
- Output is written as L4 with parent L2. Defect analysis and DCPT never accept L4 (schema-enforced).
- §24 test matrix decides per-branch inclusion: if PromptIR changes defect-classifier output on paired L2/L4 fixtures, that alone is proof it must stay out of the condition branch (it already is), and the delta is logged as artifact-introduction telemetry.
- License: NoAssertion / Restormer & AirNet lineage — **legal review required before commercial deployment `[VERIFY]`**. Mitigation if blocked: substitute Real-ESRGAN general-x4v3 denoise strength or NAFNet (permissive) for the OCR-assist branch.

FAILURE MODE: OOM/timeout on large tiles; artifact hallucination. FALLBACK: job marked FAILED_RESTORATION, pipeline continues from L2 (a failed PromptIR pass never invalidates the crop or the Tier-2 OCR result). ACCEPTANCE: measurable OCR confidence lift on degraded fixtures; zero use as condition evidence.

## 8. GFPGAN Integration

One job: **portrait ROI restoration for display and identity matching**, opt-in, server-side.

- Trigger: Vision face detection on L2 finds a portrait region → user (or identification service) explicitly requests face enhancement → face ROI (aligned 512×512) → GFPGAN → composited preview stored as L5.
- Never runs whole-card. Never by default. L5 is banned from defect/DCPT inputs at schema level; UI labels it "AI-restored (display only)".
- Utility must be proven in §25 before it ships at all: if it doesn't measurably improve human recognition or identity matching on vintage/low-res card portraits, cut the branch entirely.
- Weights ~330 MB class; PyTorch CUDA next to Real-ESRGAN (same basicsr stack already in `requirements.txt`). Weight license for commercial use `[VERIFY]`.

FAILURE MODE: hallucinated identity ("makes it a different player"). FALLBACK: side-by-side original always shown; identity matching runs on BOTH L2-face and L5-face and flags disagreement. ACCEPTANCE: human-eval preference on fixture portraits + no identity-match flips introduced.

## 9. DCPT Integration

Placement: **SERVER_SIDE, HYBRID-ready.** The decisive facts from the audit:

- The model itself is tiny (<1M params) — inference anywhere is trivial.
- What's expensive and *missing* is everything upstream: image → node features, graph construction, and TDA descriptors (`T*`). `TDAGPUAccelerator` is a placeholder; persistent homology on real images is CPU-heavy.
- Therefore: iPhone contributes capture + L2 + (optionally) cheap patch statistics; server owns feature extraction → `construction.py` graph → `tda_core.py`/`t_star.py` → `dcpt_model.py` inference.

Required build-out (this is new work, not integration): an image encoder that maps L2 into the 10-node/64-feature graph the model expects — e.g., 10 semantic card regions (4 corners, 4 edges, surface, centering frame) each pooled to 64-d features. Until that exists and the model is retrained on real data, **DCPT outputs must be labeled EXPERIMENTAL in the UI**.

Server returns: `defect_predictions[6-class + confidence], value_estimate ± interval, attention_weights (rendered as L6 overlay), t_star_summary, model_version`.

FAILURE MODE: model trained on synthetic data disagrees with human graders. FALLBACK: DCPT is advisory alongside the deterministic blemish detector; both shown with provenance. ACCEPTANCE: correlation with graded fixture labels above an agreed floor before removing the EXPERIMENTAL badge.

## 10. Swift Module Architecture

SPM workspace, one app target + feature packages (only abstractions with operational purpose):

```
CardCropApp (SwiftUI app, navigation, DI wiring)
├─ Capture          CaptureService (actor), CaptureStateMachine, QualityGates
├─ PhotoLibrary     PhotoKit import, multi-select
├─ CropEngine       CardDetector, CornerRefiner, PerspectiveCorrector, ManualCornerEditor
├─ ImagePipeline    ArtifactStore (L0–L6 lineage), Layer transforms, Core Image chains
├─ OCR              OCRService (Vision tier), RegionTemplates, TextNormalizer
├─ Identification   CardIdentityService (DB match client)
├─ Analysis         AnalysisClient (defects, DCPT, valuation DTOs)
├─ Restoration      RestorationClient (PromptIR/GFPGAN job requests — thin, server-backed)
├─ Networking       APIClient (versioned), UploadService (background URLSession)
├─ Jobs             JobQueue (actor), JobReconciler, persistence-backed states
├─ Persistence      SwiftData models, migrations, image file store (App Support, .noFileProtection tiers audited)
├─ Models           Canonical structs (§15), Codable API DTOs
├─ Telemetry        os.signpost latency spans, thermal/battery sampling, opt-in metrics
└─ Settings         Feature flags (server-driven), quality thresholds
```

Concurrency rules: every service touching mutable state is an `actor`; pixel work happens off the main actor on dedicated queues; `CVPixelBuffer`s never cross actor boundaries — hand off `CGImage`/`IOSurface` references.

## 11. Camera Architecture

AVFoundation, two-stream design:

- `AVCaptureVideoDataOutput` preview stream at ~1280×720 for detection/quality gates (30 fps budget: detector must run <20 ms/frame or drop to every-other-frame).
- `AVCapturePhotoOutput` full-resolution HEIC (ProRAW optional on supported devices) captured only on STABLE.

State machine (single source of truth for UI + haptics):

```
IDLE → SEARCHING → CARD_DETECTED → STABLE → CAPTURING → PROCESSING → REVIEW → ACCEPTED
                ↖ (lost card / quality regression returns to SEARCHING)
```

Per-frame quality gates (all cheap, vImage/Accelerate): blur (Laplacian variance), glare (specular highlight fraction inside card quad), perspective skew (quad angle deviation), card occupancy (quad area / frame area ≥ threshold), edge visibility (all 4 edges contrast), exposure (histogram clipping), motion (gyro + inter-frame corner delta). STABLE requires N consecutive passing frames.

Also supported: flash/torch control, tap-to-focus/expose, capability detection (fallback path for non-ANE devices), Photos import feeding the same L0 entry point.

## 12. Core ML / ONNX Strategy

- Conversion pipeline where used: PyTorch/Paddle → ONNX → Core ML (`coremltools`), with a validation harness that runs paired inference (reference vs converted) on the fixture set and records max/mean tolerance. **A converted file that hasn't passed tolerance validation does not ship.**
- Candidates: only PP-OCRv5-mobile (benchmark-gated, §6) and a possible future tiny card-corner detector. PromptIR and GFPGAN are excluded (§2 verdicts). DCPT excluded until its upstream features exist.
- Precision: start FP16 (ANE-native); INT8 only if the OCR accuracy delta on fixtures is within tolerance.
- Known conversion risks to record per attempt: dynamic input shapes (Paddle det model), unsupported ops, NMS post-processing outside the graph.
- Artifact versioning (server-side model registry + on-device manifest): `model_name, source_commit, weights_hash, conversion_script_version, runtime, precision`.

## 13. API Contract

New versioned surface (FastAPI, added alongside — the existing `/upload`, `/enhance`, `/status` etc. remain untouched for the web dashboard until it migrates):

```
POST /api/v1/cards                          create card record
POST /api/v1/cards/{id}/images              upload artifact (multipart; headers: layer, parent_artifact_id, transform_json, content SHA-256; idempotency-key)
POST /api/v1/cards/{id}/analyze             create analysis job {branches: [defects, ocr, dcpt, valuation, restoration_assist, face_restore], input_artifact_id}
GET  /api/v1/cards/{id}                     card + artifacts + results
GET  /api/v1/jobs/{id}                      job state + per-branch results
POST /api/v1/batches                        batch of card analyze jobs
GET  /api/v1/batches/{id}                   batch progress
GET  /api/v1/models                         model registry versions (client compatibility check)
```

Rules: server validates `layer` against branch (defects/dcpt require L2); all mutations require `Idempotency-Key`; auth via short-lived tokens (§17); every response includes `model_versions` used.

## 14. Job / Queue Architecture

Client-side (`Jobs` module): persistent queue with states `QUEUED → UPLOADING → PROCESSING → COMPLETED | FAILED | RETRYING | CANCELLED`. Job IDs (client-generated UUID = idempotency key) persist in SwiftData before the first byte is sent — a timeout can never create a duplicate job, because retry re-sends the same key and the server deduplicates.

Server-side: extend the existing `batch_processor` pattern with persistence (its current in-memory dict loses jobs on restart — must move to DB + a real queue; Redis/ARQ or Postgres-backed `[VERIFY choice in M2]`), per-branch sub-jobs, and checkpointing (capture → crop metadata → upload → each analysis branch → result), so partial results survive worker death. `TIMEOUT != NO RESULT`: the client's JobReconciler polls `GET /jobs/{id}` before ever re-submitting.

## 15. Persistence (iPhone Data Model)

Canonical objects (SwiftData):

```
CardCapture     id, createdAt, source(camera|library), batchId?, status
ImageArtifact   artifact_id, parent_id?, layer(L0–L6), source, transform(homography/crop json),
                model?, model_version?, created_at, sha256, local_url, remote_url?
CropGeometry    corners[4] (normalized), confidence, homography[9], crop_dimensions, warnings[]
OCRResult       raw_text, normalized_text, bbox, confidence, language, engine, input_layer, model_version
CardIdentity    candidate matches[], selected?, match_confidence, source(ocr|manual)
DefectResult    type, severity, bbox, confidence, input_artifact_id (must be L2), model_version
DCPTResult      defect_logits, value_estimate, attention_ref(L6 artifact), t_star_summary, model_version, experimental=true
ValuationResult estimate, currency, interval, comps_source, as_of
AnalysisJob     job_id(=idempotency key), state, branches[], checkpoints[], server_job_id?, retries
BatchJob        id, card_ids[], progress, state
```

Image bytes live in the file system (Application Support, excluded from iCloud backup for L1–L6, L0 included); DB stores metadata + hashes. L0 is delete-protected while its `CardCapture` exists.

## 16. Offline / Background Behavior

Offline-capable (fully local): capture, quality gates, detection, manual corners, rectification/crop (L2), display enhancement (L3), Vision OCR, metadata entry, queuing. Network-required work enters `PENDING_UPLOAD` / `PENDING_ANALYSIS` and is visible in the UI as such.

On connectivity: JobReconciler → verify server state by idempotency key → resume uploads (background `URLSession` with file-based tasks survives app termination) → submit analysis → store results. `BGProcessingTask` handles deferred heavy local work (thumbnail generation, hash computation) and reconciliation sweeps. No promise of unrestricted background runtime — every flow is resumable from its last checkpoint after force-quit.

## 17. Security

- **No provider keys in the bundle** (`GEMINI/OPENAI/XAI/OPENROUTER/VENICE`): the app authenticates to the Card Enhancer backend only; the backend brokers any AI provider calls server-side. (Audit note: no such keys exist in the repo today; this rule binds the new backend work.)
- Keychain for session/refresh tokens; certificate pinning `[VERIFY policy]`; short-lived JWT + refresh.
- Upload hardening server-side (extends existing checks in `main.py`): magic-byte MIME sniffing (not extension-only), decompression-bomb guards (pixel-count cap before decode), dimension/size caps, path traversal already handled for ZIPs — replicate for all writes, replay protection via idempotency keys + content SHA-256, per-user rate limits.
- CORS `allow_origins=["*"]` in the existing FastAPI app must be locked down for production.

## 18. UX Screens

Navigation: `Capture · Batch · Library · Analyze · Results · AI · Settings`

- **Capture**: live preview, animated card-quad overlay, quality indicator chips (blur/glare/angle/fill), auto-capture on STABLE with manual override, torch, Photos import.
- **Review**: L0 vs L2 comparison, draggable corner handles (magnifier loupe) when crop confidence < threshold, enhancement toggle (L3), Vision OCR preview with per-field confidence.
- **Results**: identified card (match confidence + manual override), condition findings from L2 with overlay toggle (L6), DCPT panel (EXPERIMENTAL badge), valuation with interval, and a **provenance strip** on every result stating which layer and model version produced it. Uncertainty is never hidden — low confidence renders as low confidence.
- **Batch**: multi-card queue, per-card state, resumable.
- **AI**: assistant surface backed by server-brokered providers (future; server-side keys only).

## 19. Web / iPhone Design-System Mapping

The web dashboard keeps shadcn/ui (already vendored in `app/src/components/ui/`). The iPhone app uses native SwiftUI. Shared: a design-token JSON (colors incl. the Holo UI palette, spacing scale, radii, type scale) exported from the Tailwind config and consumed by a generated `DesignTokens.swift`; component *semantics* map (Card→grouped section, Dialog→sheet, Toast/sonner→SwiftUI overlay banner, Progress→ProgressView). No React components cross into Swift.

## 20. Test Matrix

Fixture set (physical iPhone photos + flat scans, versioned in object storage): flat scan, handheld photo, rotation sweep, perspective sweep, glare, shadow, penny sleeve, toploader, dark card, white-border card, foil/holo, borderless, damaged edge, damaged corner, motion blur, partial obstruction, multiple cards in frame.

Per-fixture measurements: corner error (px @ L1 resolution), crop IoU vs hand-labeled quad, perspective residual, OCR field accuracy per engine tier, end-to-end latency, peak RAM, thermal state transitions, battery per 100 captures, upload success/resume rate, analysis completion rate. Device lab: iPhone 12, 14, 16-class minimum. **Simulator success ≠ device validation** — CI runs unit/logic tests; the measurement suite runs on hardware.

OCR sub-matrix (§23 of brief): whole-card vs region vs rectified vs L3-enhanced vs L4-PromptIR-assisted, per engine (Vision / Paddle-server / Paddle-mobile-candidate). PromptIR sub-matrix (§24): L2 vs L4 on OCR lift, defect-classifier delta (must be measured and must not leak into evidence), artifact introduction, latency. GFPGAN sub-matrix (§25): human-eval + identity-match agreement on portrait ROIs only.

## 21. Performance Benchmarks Required (gates, not aspirations)

| Benchmark | Gate |
|---|---|
| Preview-frame detection | <20 ms p50, <35 ms p95 on iPhone 12 |
| Full-res rectify + crop | <400 ms |
| Vision OCR on L2 | <1.5 s |
| Capture→REVIEW (offline) | <3 s |
| PP-OCRv5-mobile on-device candidate | Ships only if ≥ +5 pts field accuracy vs Vision on fixtures at <2 s and <150 MB peak |
| Server analyze job (defects+OCR) | <30 s p95 |
| PromptIR branch | <60 s p95 or it is demoted to batch-only |
| App peak RAM during capture | <350 MB |
| Thermal | No `.serious` state within a 20-card session |

## 22. Repository / File Layout

```
Card-Enhancer-Vercel/
├─ ios/CardCrop/                    # new: SwiftUI app + SPM packages (§10)
├─ sports-card-enhancer/app/        # existing web dashboard (unchanged)
├─ sports-card-enhancer/backend/    # existing FastAPI; gains /api/v1 router, persistence, auth
├─ backend/dcpt_pipeline/           # existing DCPT; gains image→graph encoder, real-data training
├─ services/restoration/            # new: PromptIR + GFPGAN workers (GPU), license-gated
├─ services/ocr/                    # new: PP-OCRv5 server worker (ONNX Runtime GPU)
├─ shared/design-tokens/            # new: tokens.json → Tailwind + DesignTokens.swift
├─ fixtures/                        # new: test fixture manifests (images in object storage)
└─ docs/                            # this blueprint, ADRs, benchmark reports
```

## 23. Implementation Order

1. **M0 — Foundations**: fixture capture set; `/api/v1` skeleton with idempotent jobs + persistent queue (replaces in-memory dict); auth.
2. **M1 — Capture & Crop (offline-complete)**: camera state machine, quality gates, OpenCV/Vision-based detector + corner refiner, rectification, lineage store, manual corner editor. Ship criterion: §21 crop gates green on device.
3. **M2 — OCR & Identity**: Vision tier + normalization + card-DB match; server PaddleOCR tier; benchmark Paddle-mobile candidate; decision recorded as ADR.
4. **M3 — Server Analysis**: defect branch on L2 (port existing blemish detector behind v1), Real-ESRGAN export path, background upload + reconciliation.
5. **M4 — Restoration branches**: degradation gate + PromptIR (license permitting) for OCR-assist; GFPGAN opt-in behind its §25 evidence.
6. **M5 — DCPT**: image→graph encoder, real-data training, EXPERIMENTAL rollout with provenance UI.
7. **M6 — Batch, history, polish, telemetry-driven tuning.**

## 24. Risks / Blockers

| Risk | Severity | Mitigation |
|---|---|---|
| PromptIR license (NoAssertion, Restormer lineage) | HIGH — can block the branch | Legal review in M0; NAFNet/Real-ESRGAN fallback identified |
| DCPT has no image encoder + synthetic-only training | HIGH — headline feature unproven | M5 scoped as research; EXPERIMENTAL badge; deterministic detector remains authoritative |
| Foil/holo glare defeats both OCR tiers | MEDIUM | Multi-frame capture (torch on/off pair), region retry, manual entry always available |
| Server job store is in-memory today | HIGH for reliability | M0 persistence work, first thing built |
| GFPGAN hallucination harms trust | MEDIUM | Opt-in, display-only, side-by-side, may be cut by §25 |
| Vision OCR insufficient on vintage fonts | MEDIUM | Paddle-mobile candidate path already designed |
| No existing crop code to port (brief assumed WebGL) | LOW (schedule) | M1 builds it; classic CV approach is well-trodden |

## 25. Definition of Done

- Every subsystem in this document has recorded INPUT/OUTPUT/RUNTIME/DEVICE/MODEL/FAILURE/FALLBACK/TEST/ACCEPTANCE either inline above or in its ADR.
- All §21 gates green on physical iPhone 12/14/16-class hardware; benchmark reports committed to `docs/`.
- Lineage invariants enforced by server schema tests: no L3/L4/L5 artifact ever accepted by defect or DCPT branches; every result row carries `input_artifact_id`, `layer`, `model_version`.
- Offline capture→crop→queue→kill-app→relaunch→resume passes without data loss; no duplicate jobs under induced timeout.
- No AI provider key present in the IPA (CI secret-scan on the archive).
- Every `[VERIFY]` in this document resolved with a linked ADR or measurement.

---

FINAL RULE (restated as the operating contract): each model has exactly one job — Vision/PaddleOCR read text, PromptIR assists machine readability on a copy, GFPGAN restores faces for display only, DCPT scores condition/value server-side from clean L2 evidence. Preserve L0. Branch the analysis. Measure every enhancement. Keep condition evidence clean.