# Production-Readiness Audit: Card Enhancement Implementation

## Executive summary

The repository contains useful foundations for a card-enhancement product, including a typed training configuration, checkpoint metadata, OpenCV image processing, a web batch workspace, and an experimental Streamlit application. It is not yet production-ready. Six high-priority risks require attention before operators can trust results: model/checkpoint compatibility is only partially enforced; batch output verification is absent; checkpoint loading needs stricter safety and schema validation; training resume must restore all scheduling state; invalid dataset sizes must fail before work begins; and GUI automation needs bounded waits.

The most immediate reliability concerns are output integrity and checkpoint handling. A successful function return currently does not prove that an output exists, can be decoded, has the expected dimensions, or corresponds to the requested input. Likewise, safe loading is a strong default in the DCPT checkpoint module, but it is not a repository-wide rule and does not cover every possible checkpoint format. These are confirmed implementation risks based on the inspected code. The impact of the ELAN compatibility concern is confirmed as a verification gap: the visible checkpoint contract targets `DCPTModel`, so an ELAN checkpoint cannot be assumed compatible without an explicit adapter and tensor-shape test.

Recommended sequencing is: establish a shared validation/error contract, make checkpoint loading allow-listed and compatibility-tested, add atomic output verification and manifests, validate datasets before constructing loaders, restore scheduler state with optimizer state, and add timeouts to every automation wait. The accessible dark batch workflow, OCR review, YOLO alignment, restoration adapters, and eBay CSV import should remain behind clearly labeled, testable capabilities rather than simulated success states.

## 1. ELAN architecture and checkpoint compatibility — High priority

**Finding.** The checkpoint loader validates repository versions and instantiates `DCPTModel` from serialized configuration. That is appropriate for DCPT checkpoints, but it does not establish compatibility with an ELAN architecture or with checkpoints produced by another model family. A checkpoint can contain a valid-looking state dictionary while having different module names, tensor layouts, normalization assumptions, or output heads.

**Implication.** Loading the wrong architecture can fail late with missing/unexpected keys, or worse, partially load after permissive filtering and produce plausible but invalid scores. This is especially dangerous for card valuation and defect classification because errors may look like normal model output.

**Recommendation.** Add an explicit `architecture` identifier, architecture version, required tensor signature, and adapter registry to checkpoint metadata. Reject unknown architectures by default. For each supported adapter, run strict `load_state_dict`, verify every required key and shape, and execute a deterministic smoke inference with expected output names and dimensions. Never use `strict=False` without reporting and enforcing an allow-list of intentionally missing keys.

**Evidence boundary.** The incompatibility risk is confirmed by the DCPT-specific loader contract. Whether a particular ELAN checkpoint is compatible is an observation requiring the actual checkpoint and architecture definition; it must not be claimed until the signature test passes.

## 2. Inadequate batch output verification — Critical

**Finding.** `BatchEnhancementService.process_batch` marks an item successful when `enhance()` returns. The lower-level adaptive batch helper similarly returns success after `preprocessor.process()` without checking an output artifact. The enhancement service returns an in-memory array, but there is no shared check for non-empty pixels, supported dtype/channel count, finite values, expected dimensions, or successful encoding to the requested format.

**Implication.** Corrupt, empty, incorrectly sized, or unwriteable results can enter a ZIP or downstream OCR stage while the job reports success. A partial batch may therefore be mistaken for a complete restoration run.

**Recommendation.** Introduce `validate_image_output(image, source, settings)` and call it before persistence and before marking success. Check `np.ndarray`, 2D/3D shape, `uint8` or explicitly supported dtype, finite values, positive dimensions, maximum dimensions, and a decode-after-encode round trip. Write to a temporary file, fsync where appropriate, atomically rename, then verify existence and byte size. Store a manifest record containing source hash, output hash, dimensions, model, settings, and error details. Mark status as `verified`, `failed`, or `skipped`, never simply `success`.

## 3. Unsafe or inconsistent checkpoint loading — Critical

**Finding.** `backend/dcpt_pipeline/training/checkpoint.py` uses `torch.load(..., weights_only=True)` and catches load failures, which is a good safety control. However, the broader repository includes multiple model services and checkpoint entry points, so this protection is not guaranteed globally. Metadata validation also assumes fields are present and valid, and there is no file-size, hash, or resource limit before parsing.

**Implication.** A legacy loader may deserialize arbitrary pickle content. Malformed metadata can produce confusing failures, while a huge or hostile file can consume excessive memory. Model files are executable-adjacent inputs and should be treated as untrusted.

**Recommendation.** Centralize loading in one safe utility. Permit tensor/state-dict primitives only, require an explicit trusted format, enforce maximum file size, optionally verify a configured SHA-256, and validate metadata with a strict schema before model construction. Do not add unsafe globals to bypass `weights_only`; convert legacy files offline in a controlled environment. Add tests proving malicious/non-dict payloads and incompatible tensors are rejected.

## 4. Scheduler state during resume — High priority

**Finding.** The current `resume()` implementation does restore `scheduler_state_dict` when a scheduler exists. This is a positive control, but it is not yet sufficient as a production guarantee: checkpoints can omit scheduler state, a checkpoint can be resumed under a different scheduler configuration, and the training loop does not validate that the restored `last_epoch` and learning rate agree with the requested start epoch.

**Implication.** A resume may silently continue with a fresh or mismatched learning-rate schedule, changing convergence and making runs irreproducible.

**Recommendation.** Make scheduler configuration and state mandatory whenever scheduling is enabled. Validate scheduler class, `last_epoch`, base learning rates, and epoch bounds during resume; reject mismatches unless an explicit migration flag is used. Save RNG states, scaler state for FP16, and dataloader/sampler state alongside optimizer and scheduler state. Add a test that compares uninterrupted training with save/resume training for the next optimizer step and learning rate.

## 5. Late failure for invalid dataset sizes — High priority

**Finding.** `MultiTaskTrainer` does calculate split sizes and raises when `n_train < 1`, which prevents the worst case. Validation still happens after dataset construction and after `n_val`/`n_test` are forced to at least one. This means tiny datasets can pass into expensive graph/TDA initialization before failing, and configurations where split fractions consume nearly all samples are not rejected with a targeted message.

**Implication.** Operators receive late, less actionable failures and may waste memory or time. A dataset with one or two samples cannot support meaningful train/validation/test evaluation, even if arithmetic permits it.

**Recommendation.** Add a preflight validator before model, graph, or loader creation. Require positive sample count, valid fractions in `[0,1)`, `val + test < 1`, minimum counts configured explicitly, and class coverage for classification. Report the exact requested split and minimum required dataset size. Keep a separate override for controlled smoke tests.

## 6. GUI automation indefinite waits — High priority

**Finding.** The GUI/Streamlit implementation performs synchronous image operations and exposes batch controls, but the inspected implementation has no universal operation deadline, cancellation token, progress heartbeat, or watchdog around long-running model work. A model download, GPU stall, malformed image, or external integration can leave the interface waiting indefinitely.

**Implication.** Users cannot distinguish slow processing from a dead job, cannot reliably cancel work, and may retry, duplicating outputs or consuming resources.

**Recommendation.** Wrap each item and the whole batch in bounded timeouts appropriate to the execution environment. Surface determinate progress, current filename, elapsed time, and a cancel action. Persist a resumable manifest after each verified item. Move long work off the UI thread where supported, handle cancellation between stages, and return a structured timeout error with retry guidance. Test stalled model calls, hung file reads, and cancellation.

## Product and UX recommendations

The product should present a near-black batch-first interface with high-contrast neutral text and a restrained cyan accent, while communicating status with text, icons, and patterns rather than color alone. This supports WCAG 2.2 AA contrast and users with color-vision deficiencies. Remove or hide side-panel features that do not have a verified backend action; a disabled control with an explanation is safer than a button that simulates progress.

YOLO alignment should be implemented as a vetted adapter: pose/segmentation inference, four-corner validation, homography, and a documented contour fallback. OCR should return candidate card identity, confidence, and a user review state; it should never silently overwrite identity. eBay CSV ingestion should validate headers, normalize identifiers, record source and import date, deduplicate listings, and calculate the lowest price only from valid comparable listings. These are feasible recommendations, not claims that the repository already contains trained card-specific OCR or a live eBay feed.

## Conclusion

The project has several sound building blocks, notably typed configuration, dataset fingerprints, checkpoint metadata, and an existing scheduler-state load path. Production readiness requires turning those isolated controls into enforced system-wide contracts. Output verification, safe loading, early validation, resumable state, and bounded automation should be completed before external users rely on enhancement or valuation results. After those safeguards are tested, the accessible batch UI and YOLO/OCR/CSV workflows can be expanded through explicit adapters with measurable accuracy and clear provenance.
