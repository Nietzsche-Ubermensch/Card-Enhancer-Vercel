You are the senior implementation engineer responsible for completing the CardEnhance production application.
THIS IS A REPOSITORY-EDITING TASK.
Do not write a proposal.
Do not give me architecture advice.
Do not give me a roadmap.
Do not give me pseudocode.
Do not create stubs.
Do not create placeholder components.
Do not create mock API responses.
Do not create fake image-processing results.
Do not create buttons that are not connected.
Do not stop after writing tests.
Do not substitute test scaffolding for production code.
Do not leave TODO/FIXME/NotImplemented/pass in any required production path.
OPEN THE ACTUAL REPOSITORY.
INSPECT WHAT EXISTS.
REUSE WORKING CODE.
WRITE THE COMPLETE PRODUCTION IMPLEMENTATION.
The required product is a professional sports-card scanning, extraction, restoration, enhancement, comparison, batch-processing, and export application.
======================================================================
PRODUCT EXPERIENCE
======================================================================
A user must be able to:
1. open CardEnhance;
2. drag one image, many card images, or multiple flatbed scanner sheets into the application;
3. see uploads enter a real batch;
4. have every physical card automatically detected;
5. have multi-card scanner sheets split into individual cards;
6. have each card perspective-corrected;
7. have each card automatically oriented correctly;
8. see a clean thumbnail gallery;
9. select any card;
10. inspect its original/rectified image;
11. generate a real upscaled version;
12. generate a real descratched version;
13. generate a real descratched + upscaled version;
14. compare before/after results interactively;
15. zoom and pan to inspect fine card detail;
16. apply operations to one card or many cards;
17. retry individual failures;
18. manually correct orientation when necessary;
19. select cards for export;
20. choose the output variant;
21. export one card;
22. export selected cards;
23. export all completed cards;
24. download a real ZIP;
25. receive a real manifest describing every exported image.
Every one of those steps must be backed by real production code.
======================================================================
A. REQUIRED ARTIFACT TYPES
======================================================================
Every card can have these artifact types:
ORIGINAL_SOURCE
RECTIFIED
UPSCALED
DESCRATCHED
DESCRATCHED_UPSCALED
OPTIONALLY:
OPTIMIZED
These are distinct files/objects.
Never overwrite ORIGINAL_SOURCE.
Never overwrite RECTIFIED when producing restoration.
Required processing lineage:
SOURCE FILE
↓
DETECTED CARD
↓
RECTIFIED
├── UPSCALED
├── DESCRATCHED
└── DESCRATCHED → UPSCALED
↓
DESCRATCHED_UPSCALED
Do not alias two artifact types to the same file.
Do not return the original image as a fake processed result.
Every derivative must have metadata:
artifact_id
card_id
source_id
artifact_type
parent_artifact_id
width
height
format
created_at
processing_version
processing_parameters
relative/download URL
======================================================================
B. SOURCE FILE MODEL
======================================================================
One uploaded file is a SOURCE.
A source may contain:
ONE CARD
or
MANY CARDS.
Required source fields:
source_id
batch_id
original_filename
safe_filename
content_hash
mime_type
width
height
byte_size
status
detected_card_count
created_at
error_code
error_message
Do NOT confuse:
uploaded_file_count
with:
detected_card_count.
Example:
4 scanner sheets uploaded
→ 31 physical cards detected
source_count = 4
card_count = 31
This distinction must exist in both the backend state and the frontend UI.
======================================================================
C. CARD MODEL
======================================================================
Every physically detected card requires its own record.
Required fields:
card_id
batch_id
source_id
source_index
display_index
detector_method
detection_confidence
polygon
corners
centroid
geometry_method
geometry_confidence
orientation_degrees
orientation_confidence
orientation_method
manual_orientation_override
status
current_stage
progress
rectified_artifact_id
upscaled_artifact_id
descratched_artifact_id
descratched_upscaled_artifact_id
warnings
error_code
error_message
retryable
attempt_count
created_at
updated_at
Do not store processing state only in frontend memory.
Backend is authoritative.
======================================================================
D. BATCH MODEL
======================================================================
Implement persistent or durable-enough batch state using the current repository architecture.
Required fields:
batch_id
status
source_count
detected_card_count
queued_count
processing_count
completed_count
failed_count
cancelled_count
progress
created_at
updated_at
Required batch statuses:
QUEUED
UPLOADING
PROCESSING
PARTIAL_SUCCESS
COMPLETED
FAILED
CANCELLED
Card processing stages:
VALIDATING
DETECTING
GEOMETRY
RECTIFYING
ORIENTING
READY
UPSCALING
DESCRATCHING
DESCRATCHING_UPSCALING
EXPORTING
COMPLETED
FAILED
RETRYING
Do not use arbitrary setTimeout-based percentages.
If an exact percentage is unavailable, calculate progress from completed real stages.
======================================================================
E. DRAG-AND-DROP UPLOADER
======================================================================
Build a production-quality drag-and-drop area.
The user must be able to:
DRAG ONE FILE
DRAG MANY FILES
CLICK TO BROWSE
ADD MORE FILES TO AN EXISTING BATCH
USE MOBILE PHOTO PICKER
USE MOBILE CAMERA INPUT WHERE BROWSER SUPPORTS IT
The drop zone must visually change when files are dragged over it.
Required states:
EMPTY
DRAG_ACTIVE
UPLOADING
PROCESSING
PARTIAL_FAILURE
READY
Display:
accepted file types
upload count
total files
processing status
Do not create only:
<input type="file">
and call it done.
The input may be located beneath the designed drop area, but the product must have a polished interaction layer.
Required frontend actions equivalent to:
onDrop(files)
onBrowse(files)
addFiles(files)
removeQueuedSource(sourceId)
retrySource(sourceId)
cancelSource(sourceId)
All input routes must feed the SAME backend ingestion path.
======================================================================
F. FILE VALIDATION
======================================================================
Implement actual byte-level image validation.
Required backend responsibility:
validate_image_upload(
bytes,
filename,
declared_content_type
)
Must:
check maximum file size;
decode actual image bytes;
reject invalid/corrupt images;
reject zero-size images;
detect actual format;
verify actual dimensions;
enforce maximum pixel dimensions if necessary;
sanitize filenames;
prevent path traversal;
extract EXIF safely;
normalize EXIF orientation appropriately;
return validated metadata.
Do not trust extension.
Do not trust MIME header alone.
======================================================================
G. IMAGE FORMAT SUPPORT
======================================================================
At a minimum, support formats that are already safely decodable by the repository.
Normally:
JPEG
PNG
WEBP
If HEIC/HEIF support exists and really decodes:
support it.
If HEIC cannot actually be decoded:
do not advertise it.
Do not make unsupported formats appear selectable.
======================================================================
H. IMMUTABLE ORIGINAL STORAGE
======================================================================
Implement actual original storage.
Equivalent responsibilities:
save_original_source(...)
get_original_source(...)
verify_original_hash(...)
Store original bytes exactly once.
Calculate:
SHA-256
and preserve it.
A later operation must never modify the source file.
All processing works from a read copy or decoded image.
======================================================================
I. CARD DETECTION
======================================================================
Use the real existing detector if already present.
If YOLO segmentation is the intended detector:
load a real Ultralytics segmentation checkpoint.
Do not use:
fake boxes
static coordinates
mock YOLO result
hardcoded card rectangle
Production lifecycle:
APPLICATION START
→ LOAD MODEL ONCE
→ KEEP MODEL READY
→ PROCESS REQUESTS
Required detector output:
class
confidence
polygon/mask
bounding box
centroid
Configuration should include equivalent values:
CARD_SEG_MODEL_PATH
CARD_SEG_DEVICE
CARD_SEG_CONF
CARD_SEG_IOU
CARD_SEG_IMGSZ
Reuse the repository's configuration system.
======================================================================
J. MULTI-CARD DETECTION
======================================================================
For a scanner sheet:
detect all physical cards.
Example:
results = detect_cards(source)
For every detection:
create an independent card record.
Sort output deterministically:
top-to-bottom
then:
left-to-right
using centroid coordinates and row grouping where appropriate.
Do not depend on detector result order.
======================================================================
K. DUPLICATE DETECTION SUPPRESSION
======================================================================
Two overlapping predictions may describe the same physical card.
Implement actual duplicate suppression.
Use:
mask overlap
IoU
centroid distance
containment
and detector confidence.
Do not produce two exports for one card.
Do not suppress separate cards merely because their bounding boxes partially overlap.
======================================================================
L. POLYGON → FOUR CARD CORNERS
======================================================================
Required production responsibility:
extract_card_corners(mask_polygon)
Pipeline:
segmentation polygon
→ valid contour
→ remove obvious noise
→ convex hull when justified
→ polygon approximation
→ identify four-corner quadrilateral
→ validate quadrilateral
Preferred direct method:
cv2.approxPolyDP
with an adaptive epsilon based on contour perimeter.
If direct four-corner geometry cannot be recovered:
fallback:
cv2.minAreaRect
Return:
corners
geometry_method
geometry_confidence
warning
Possible geometry_method values:
POLYGON_QUAD
MIN_AREA_RECT_FALLBACK
Never label fallback geometry as direct polygon-corner recovery.
======================================================================
M. GEOMETRY VALIDATION
======================================================================
Required checks:
exactly four distinct points;
convexity;
nonzero area;
no self-intersection;
minimum side length;
reasonable card area relative to image;
coordinates inside or safely clipped to source bounds;
reasonable opposite edges.
If invalid:
do not call perspective warp.
Mark the card:
GEOMETRY_FAILED
without destroying other cards.
======================================================================
N. CORNER ORDER
======================================================================
Required order:
TOP_LEFT
TOP_RIGHT
BOTTOM_RIGHT
BOTTOM_LEFT
Implement robust ordering using centroid-based or angular ordering, or another proven algorithm.
Do not rely entirely on the simplistic sum/difference trick.
This must work for rotated cards.
======================================================================
O. PERSPECTIVE CORRECTION
======================================================================
Required production responsibility:
rectify_card(image, corners)
Calculate physical output width from:
distance(TL, TR)
distance(BL, BR)
Take the appropriate maximum/average.
Calculate physical output height from:
distance(TL, BL)
distance(TR, BR)
Use:
cv2.getPerspectiveTransform
cv2.warpPerspective
Preserve maximum useful source detail.
Do NOT always force:
500x700.
Support:
PRESERVE_GEOMETRY
and, where explicitly configured:
STANDARD_5_7
The default should avoid distortion.
======================================================================
P. BORDER RETENTION
======================================================================
Sports-card edges matter.
Implement a configurable safety margin around estimated card geometry when appropriate.
Goal:
preserve the complete physical card.
Do not crop at interior artwork boundary.
Do not shave white edges or dark card borders.
Do not manufacture nonexistent image area.
======================================================================
Q. SMART ORIENTATION
======================================================================
Required real responsibility:
determine_orientation(rectified_card)
Supported:
0
90
180
270
Use deterministic signals such as:
OCR text orientation;
recognized text line direction;
card-layout features;
edge/layout heuristic;
EXIF where relevant before rectification.
Return:
degrees
confidence
method
Possible methods:
EXIF
OCR
LAYOUT
GEOMETRY
MANUAL
Manual override always wins.
======================================================================
R. MANUAL ORIENTATION
======================================================================
Frontend controls:
ROTATE LEFT
ROTATE RIGHT
0°
90°
180°
270°
The action must:
call backend
→ produce/update real rectified orientation
→ update metadata
→ regenerate affected previews
Do not merely use:
transform: rotate(...)
in CSS.
The exported image must reflect the user's orientation choice.
======================================================================
S. UPSCALING
======================================================================
Required real responsibility:
upscale_card(card_id, artifact_id, scale)
Use existing Real-ESRGAN implementation if available.
Allow real supported scales, ideally:
2x
4x
Do not advertise unsupported scales.
Store:
requested_scale
actual_scale
model
method
used_real_sr
input_dimensions
output_dimensions
If Real-ESRGAN succeeds:
used_real_sr = true
If fallback OpenCV interpolation occurs:
used_real_sr = false
UI must visibly distinguish:
AI SUPER-RESOLUTION
from:
FALLBACK RESIZE
Do not lie to the user.
======================================================================
T. UPSCALE UI
======================================================================
Selected card workspace must have:
UPSCALE
scale selector:
2X
4X
processing indicator
success indicator
failure state
After completion:
UPSCALED artifact becomes available as comparison target and download target.
Bulk action:
UPSCALE SELECTED
must exist.
======================================================================
U. DESCRATCHING OBJECTIVE
======================================================================
Descratching is required.
The goal is:
REMOVE OR REDUCE SCANNER-INTRODUCED ARTIFACTS
NOT:
ERASE REAL PHYSICAL CARD DAMAGE.
Examples of possible scanner artifacts:
glass streak
scanner carriage line
dust streak
thin repeated directional artifact
scan-induced line
hair-like scanner contamination
The original must always remain untouched.
======================================================================
V. REAL DESCRATCH PIPELINE
======================================================================
Implement real processing responsibilities equivalent to:
detect_scratch_candidates(image)
classify_scratch_candidates(image, candidates)
build_scratch_mask(image, candidates)
validate_scratch_mask(image, mask)
apply_descratch(image, mask, strength)
save_descratched_artifact(...)
No function may return the input.
======================================================================
W. SCRATCH CANDIDATE DETECTION
======================================================================
Use an actual image-analysis pipeline.
A practical implementation should combine multiple signals rather than a single naive line detector.
Possible pipeline:
convert to LAB or grayscale/luminance;
calculate directional gradients;
calculate local contrast;
apply narrow morphological top-hat / black-hat operations;
find elongated connected components;
optionally use Hough lines as one signal;
calculate:
length
width
aspect ratio
directionality
local intensity difference
local texture continuity
Only retain candidates meeting configurable constraints.
Do not classify every vertical line as damage.
======================================================================
X. PROTECT REAL CARD DETAIL
======================================================================
Card artwork contains legitimate lines.
Examples:
printed borders
player silhouettes
sticks
bats
goalposts
text
frames
graphic lines
jersey seams
Use conservative filtering.
Candidates strongly aligned with high-confidence natural/artwork edges should be suppressed or penalized.
Mask coverage safety must exist.
If:
scratch_mask_coverage > configured maximum
or confidence is too low:
DO NOT DESTRUCTIVELY APPLY IT.
Return a warning:
SCRATCH_MASK_REJECTED
and preserve the unmodified input.
======================================================================
Y. SCRATCH RESTORATION
======================================================================
Use real inpainting only after a valid mask exists.
Use:
cv2.inpaint
with:
INPAINT_TELEA
or:
INPAINT_NS
unless the repository contains a superior validated method.
Strength settings:
LOW
MEDIUM
HIGH
must map to concrete processing values.
Example concept:
LOW:
very conservative mask threshold
small dilation
small inpaint radius
MEDIUM:
normal threshold
moderate dilation
moderate radius
HIGH:
more permissive candidate threshold
bounded larger radius
Do not implement HIGH as unrestricted destruction.
======================================================================
Z. DESCRATCH RESULT METADATA
======================================================================
Store:
descratch_enabled
descratch_strength
algorithm
candidate_count
accepted_candidate_count
mask_coverage_percent
inpaint_radius
warnings
processing_version
The UI may show simplified information.
Backend retains full metadata.
======================================================================
AA. DESCRATCH BUTTON
======================================================================
Selected-card UI must include:
DESCRATCH
with:
OFF
LOW
MEDIUM
HIGH
When user chooses a setting:
backend actually processes selected artifact;
new DESCRATCHED artifact is saved;
frontend receives new artifact;
comparison viewer updates.
Bulk action:
DESCRATCH SELECTED
must exist.
======================================================================
AB. DESCRATCH + UPSCALE
======================================================================
Provide:
DESCRATCH + UPSCALE
for one card and bulk selections.
Preferred default order:
RECTIFIED
→ DESCRATCH
→ UPSCALE
because scanner artifacts should normally be removed before super-resolution magnifies them.
If the existing codebase demonstrates a better order with real evidence, use it.
The combined output must be its own artifact:
DESCRATCHED_UPSCALED
Do not point this variant at UPSCALED or DESCRATCHED.
======================================================================
AC. BEFORE / AFTER COMPARISON VIEWER
======================================================================
This is a required flagship UI feature.
The selected-card view must contain a large comparison viewer.
LEFT/BACKGROUND target:
BEFORE
RIGHT/OVERLAY target:
AFTER
Selectable comparison sources:
ORIGINAL
RECTIFIED
UPSCALED
DESCRATCHED
DESCRATCHED + UPSCALED
The user must be able to choose:
BEFORE:
Rectified
AFTER:
Descratched + Upscaled
For example.
Do not hardcode only one comparison.
======================================================================
AD. COMPARISON SLIDER
======================================================================
Implement an actual drag divider.
Requirements:
horizontal drag;
touch support;
mouse support;
keyboard accessibility if practical;
visible handle;
Before label;
After label;
same viewport dimensions;
images perfectly registered;
responsive sizing;
no jump on drag;
clipped overlay technique.
Do not use two unrelated images side by side if slider mode is selected.
======================================================================
AE. ZOOM + PAN
======================================================================
Comparison workspace must support:
ZOOM IN
ZOOM OUT
RESET
PAN
Optionally:
FIT
100%
200%
400%
Both before/after layers must remain synchronized while zooming and panning.
The user should be able to inspect:
small print
corners
edges
foil texture
surface streaks
upscale artifacts
======================================================================
AF. FULLSCREEN / LARGE PREVIEW
======================================================================
Provide a large detail view or fullscreen/modal viewer.
The user should not be forced to inspect card restoration in a 250px thumbnail.
======================================================================
AG. PROFESSIONAL UI STRUCTURE
======================================================================
The main application should have this visual structure:
TOP BAR
CardEnhance branding
batch status
export action
MAIN CONTENT
LEFT / TOP:
Upload zone + batch summary
CENTER:
Card thumbnail gallery
RIGHT / DETAIL:
Selected card workspace
On smaller screens:
Stack sections intelligently.
Do not create:
- giant raw tables;
- developer console style layout;
- raw JSON displays;
- unstyled browser inputs;
- cramped controls.
======================================================================
AH. VISUAL LANGUAGE
======================================================================
Preserve the existing CardEnhance visual identity if present.
The interface should feel:
premium
clean
modern
focused
professional
Use:
consistent spacing
clear typography hierarchy
restrained borders
good contrast
smooth hover states
clean cards/panels
subtle progress animation
meaningful icons
Do not overload the UI with neon effects if they reduce readability.
Visual polish must support usability.
======================================================================
AI. CARD GRID
======================================================================
Display actual cards in a responsive grid.
Each card tile shows:
thumbnail
card index
source filename shortened appropriately
status
selected indicator
error/warning indicator
orientation indicator
artifact badges such as:
UP
DS
UP+DS
Use understandable tooltip/labels.
Selecting a card opens it in the detail workspace.
======================================================================
AJ. BATCH SUMMARY
======================================================================
Show:
sources
cards detected
processing
completed
failed
selected
Example:
3 sources
23 cards
18 completed
4 processing
1 failed
8 selected
These numbers must come from real backend/batch state.
======================================================================
AK. BULK SELECTION
======================================================================
Implement:
SELECT ALL
SELECT COMPLETED
SELECT FAILED
CLEAR SELECTION
Individual selection toggle.
Selected count must always be visible.
======================================================================
AL. BULK PROCESSING
======================================================================
Required real operations:
UPSCALE SELECTED
DESCRATCH SELECTED
DESCRATCH + UPSCALE SELECTED
RETRY FAILED
EXPORT SELECTED
Every selected card must enter real backend processing.
Use bounded concurrency.
Do not fire unlimited GPU tasks.
======================================================================
AM. CONCURRENCY
======================================================================
Implement configurable concurrency.
Equivalent:
BATCH_CONCURRENCY
REAL_ESRGAN_CONCURRENCY
YOLO_CONCURRENCY
Reuse worker controls where possible.
A reasonable sequence:
queue
→ acquire processing slot
→ execute
→ save artifact
→ update state
→ release slot
GPU OOM must not be the expected behavior for a large batch.
======================================================================
AN. FAILURE ISOLATION
======================================================================
No single bad card must fail the batch.
One corrupt source must not cancel another source.
Each card captures:
stage
error_code
message
retryable
attempt_count
Example:
card 12:
UPSCALE_FAILED
cards 1–11 and 13–20:
continue.
======================================================================
AO. RETRY
======================================================================
Required:
RETRY CARD
RETRY ALL FAILED
Optional useful:
RETRY SELECTED
Retry must execute actual failed work.
Do not only update state.
If failure occurred in DESCRATCH:
retry that operation without unnecessarily rerunning YOLO.
If fundamental source/card state is invalid:
restart from appropriate earlier stage.
======================================================================
AP. BACKEND API
======================================================================
Prefer these explicit responsibilities.
Adapt path names only if the existing API has established conventions.
POST /api/batches
Create batch.
POST /api/batches/{batch_id}/sources
Upload one or multiple sources.
GET /api/batches/{batch_id}
Get actual batch state.
GET /api/batches/{batch_id}/cards
Get cards.
GET /api/cards/{card_id}
Get full card state/artifacts.
POST /api/cards/{card_id}/orientation
Body:
{
"degrees": 90
}
POST /api/cards/{card_id}/upscale
Body:
{
"scale": 2
}
POST /api/cards/{card_id}/descratch
Body:
{
"strength": "medium"
}
POST /api/cards/{card_id}/descratch-upscale
Body:
{
"strength": "medium",
"scale": 2
}
POST /api/cards/{card_id}/retry
POST /api/batches/{batch_id}/process-selected
Body concept:
{
"card_ids": [...],
"operation": "descratch_upscale",
"parameters": {...}
}
POST /api/exports
GET /api/exports/{export_id}
GET /api/artifacts/{artifact_id}/download
If equivalent routes already exist:
extend/reuse them.
Do not create duplicated route families.
======================================================================
AQ. API RESPONSES
======================================================================
Use typed Pydantic models.
No arbitrary untyped response dumps.
Example card response concept:
{
"card_id": "...",
"source_id": "...",
"source_index": 3,
"status": "completed",
"detection": {
"confidence": 0.97,
"method": "yolo_seg"
},
"geometry": {
"confidence": 0.94,
"method": "polygon_quad",
"corners": [...]
},
"orientation": {
"degrees": 90,
"confidence": 0.91,
"method": "ocr"
},
"artifacts": {
"rectified": {...},
"upscaled": {...},
"descratched": {...},
"descratched_upscaled": {...}
},
"warnings": []
}
======================================================================
AR. PROGRESS DELIVERY
======================================================================
Use the existing real-time mechanism if the repository already has one.
If not:
Use simple backend-state polling rather than introducing unnecessary infrastructure.
Frontend may poll:
GET /api/batches/{id}
at a reasonable interval while active.
Do not add Redis/WebSockets solely for fashion.
======================================================================
AS. STORAGE LAYOUT
======================================================================
Use repository-configured storage roots.
Logical structure may resemble:
storage/
sources/
<source_id>/
original.ext
cards/
<card_id>/
rectified.png
upscaled_2x.png
descratched_medium.png
descratched_medium_upscaled_2x.png
preview.webp
exports/
<export_id>/
CardEnhance_Export_....zip
Do not hardcode this exact layout if the repository already has a storage abstraction.
Do not use developer-specific absolute paths.
======================================================================
AT. THUMBNAILS
======================================================================
Generate real lightweight previews.
Do not serve every full-resolution 20MB scanner crop as a thumbnail.
Create:
thumbnail
preview
full artifact
as appropriate.
Frontend grid should load thumbnails.
Detail view loads preview/full image as needed.
======================================================================
AU. BROWSER MEMORY
======================================================================
Do not keep every original image permanently as full-resolution browser state.
For local upload previews:
use object URLs.
Revoke them when no longer needed.
After backend upload:
Prefer backend-generated thumbnail URLs.
======================================================================
AV. EXPORT DIALOG
======================================================================
Implement a polished export modal/panel.
Options:
SCOPE
Current Card
Selected Cards
All Completed
OUTPUT VERSION
Rectified
Upscaled
Descratched
Descratched + Upscaled
FORMAT
PNG
JPEG
WEBP if really supported
QUALITY
Only display for lossy formats.
ZIP
Automatically for multi-card export.
Button:
EXPORT
Show real progress.
Then trigger real download.
======================================================================
AW. INDIVIDUAL EXPORT
======================================================================
For one card:
Allow direct download of any generated artifact.
Do not force ZIP for one card unless existing design requires it.
======================================================================
AX. BULK ZIP
======================================================================
For multiple cards:
backend creates a valid ZIP.
Required contents:
CardEnhance_Export_<timestamp>/
images/
<safe filename>
manifest.json
ZIP creation must stream or use sensible memory handling for large batches.
Do not load hundreds of full-resolution files into memory simultaneously if avoidable.
======================================================================
AY. MANIFEST
======================================================================
manifest.json requires:
export_id
created_at
artifact_selection
format
card_count
cards: [
{
"card_id": "...",
"source_id": "...",
"source_filename": "...",
"source_index": 1,
"output_filename": "...",
"artifact_type": "descratched_upscaled",
"width": 1500,
"height": 2100,
"orientation": 0,
"detection_confidence": 0.98,
"geometry_confidence": 0.94,
"upscale": {
"requested_scale": 2,
"actual_scale": 2,
"model": "...",
"used_real_sr": true
},
"descratch": {
"strength": "medium",
"algorithm": "...",
"mask_coverage_percent": 0.73
},
"warnings": []
}
]
No internal absolute paths.
No credentials.
======================================================================
AZ. FILENAME GENERATION
======================================================================
Default:
card_<source-sequence>_<card-sequence>_<artifact>.<extension>
Example:
card_002_007_descratched_upscaled.png
If verified card identity metadata exists, allow:
1998_topps_michael_jordan_23_upscaled.png
after strict sanitization.
Never use untrusted text directly.
======================================================================
BA. RESET / REPROCESS
======================================================================
Selected card actions must include:
RESET TO RECTIFIED
This should change the currently selected output/view back to RECTIFIED.
It must NOT delete the original unless explicitly intended.
Optional:
REPROCESS CARD
should regenerate derived artifacts from the preserved rectified/source state.
======================================================================
BB. SOURCE PROTECTION IN UI
======================================================================
Clearly identify:
ORIGINAL
versus:
RESTORED / DESCRATCHED
The UI must not imply that restoration is original evidence.
If condition grading exists elsewhere:
never silently use DESCRATCHED or AI-restored artifact as the physical-condition source.
======================================================================
BC. DESCRATCH SAFETY
======================================================================
When descratching confidence is poor:
do not aggressively modify.
Prefer:
DESCRATCH_SKIPPED_LOW_CONFIDENCE
with a warning.
User can choose stronger processing manually.
The automatic destruction of card details is unacceptable.
======================================================================
BD. PROFESSIONAL EMPTY STATE
======================================================================
When no batch exists, display something equivalent to:
Enhance your cards
Drag card images or multi-card scanner sheets here
Supports batch processing, automatic cropping, upscaling, and removal of scanner artifacts.
[ Choose Images ]
Keep text concise and professional.
======================================================================
BE. LOADING STATES
======================================================================
Use skeletons/spinners only where meaningful.
Card tile example:
Detecting...
Crop...
Upscaling...
Descratching...
Ready
Do not freeze the entire application because one card processes.
======================================================================
BF. ERRORS
======================================================================
Frontend error messages should be human-readable.
Examples:
Could not decode this image.
No card was detected in this source.
Card geometry could not be determined.
Super-resolution model is unavailable.
Descratching was skipped because the detected mask was unsafe.
Export could not be created.
Keep detailed exception stack in backend logs, not user UI.
======================================================================
BG. MODEL UNAVAILABLE
======================================================================
If YOLO or Real-ESRGAN cannot load:
do not return fake success.
Report explicit state.
YOLO unavailable may block card detection.
If Real-ESRGAN is unavailable, allow other functionality to continue where possible.
Do not turn an optional enhancement failure into total application failure.
======================================================================
BH. NO AI PROVIDER DEPENDENCY
======================================================================
External LLM providers are irrelevant to the core workflow.
Core must operate with:
NO OPENAI
NO OPENROUTER
NO GEMINI
NO XAI
NO VENICE
NO SAKANA
Do not spend this implementation cycle expanding provider infrastructure.
======================================================================
BI. EXACT PRODUCTION FUNCTIONS
======================================================================
The following responsibilities MUST exist as real code somewhere in production.
Names may match repository style.
IMAGE INGESTION
validate_upload(...)
decode_image(...)
normalize_exif_orientation(...)
store_original(...)
calculate_source_hash(...)
BATCH
create_batch(...)
add_sources_to_batch(...)
update_batch_state(...)
get_batch_state(...)
CARD DETECTION
detect_cards(...)
deduplicate_detections(...)
sort_detections(...)
GEOMETRY
polygon_to_contour(...)
extract_quad(...)
fallback_min_area_rect(...)
validate_quad(...)
order_corners(...)
rectify_card(...)
ORIENTATION
detect_orientation(...)
apply_orientation(...)
apply_manual_orientation(...)
QUALITY
measure_sharpness(...)
measure_exposure(...)
measure_contrast(...)
measure_white_balance(...)
measure_highlight_clipping(...)
measure_shadow_clipping(...)
estimate_noise(...)
UPSCALE
load_upscaler(...)
upscale_card(...)
DESCRATCH
detect_scratch_candidates(...)
build_scratch_mask(...)
validate_scratch_mask(...)
apply_descratch(...)
COMBINED
create_descratched_upscaled(...)
ARTIFACTS
save_artifact(...)
get_artifact(...)
generate_thumbnail(...)
generate_preview(...)
PROCESSING
process_source(...)
process_card(...)
process_selected_cards(...)
retry_card(...)
EXPORT
sanitize_export_filename(...)
export_single_card(...)
create_export_manifest(...)
create_export_zip(...)
create_bulk_export(...)
Every required responsibility must execute real logic.
======================================================================
BJ. EXACT FRONTEND RESPONSIBILITIES
======================================================================
Implement working UI equivalents for:
CardEnhancePage
DropZone
BatchSummary
CardGrid
CardTile
CardWorkspace
ArtifactSelector
BeforeAfterSlider
ZoomPanViewer
OrientationControls
EnhancementControls
DescratchControls
BulkActionBar
BatchProgress
ErrorBanner
ExportDialog
Required actions:
dropFiles(...)
chooseFiles(...)
addFiles(...)
selectCard(...)
toggleCardSelection(...)
selectAll(...)
selectCompleted(...)
clearSelection(...)
rotateCard(...)
requestUpscale(...)
requestDescratch(...)
requestDescratchUpscale(...)
retryCard(...)
retryFailed(...)
processSelected(...)
openExportDialog(...)
exportCurrent(...)
exportSelected(...)
exportAll(...)
downloadArtifact(...)
No required action may be a no-op.
======================================================================
BK. NO PLACEHOLDERS
======================================================================
Before completion, inspect production files for:
TODO
FIXME
pass
NotImplementedError
throw new Error("Not implemented")
placeholder
stub
dummy
mock
coming soon
temporary
fake
console. log-only event handler
static fake API data
setTimeout fake completion
For every occurrence in the required workflow:
implement it properly or remove it.
Required production-path count:
ZERO.
======================================================================
BL. CODE BEFORE TESTS
======================================================================
Do not derail execution by designing a large testing system first.
Implementation order is:
1. inspect repository;
2. implement source ingestion;
3. implement batch model;
4. implement real card detection;
5. implement multi-card extraction;
6. implement geometry;
7. implement perspective correction;
8. implement orientation;
9. implement artifacts/storage;
10. implement Real-ESRGAN operation;
11. implement descratching;
12. implement combined output;
13. implement API routes;
14. implement frontend drag/drop;
15. implement card gallery;
16. implement detail workspace;
17. implement before/after slider;
18. implement zoom/pan;
19. implement individual controls;
20. implement bulk controls;
21. implement retry;
22. implement export dialog;
23. implement real ZIP/manifest;
24. connect all frontend actions to backend;
25. eliminate placeholders;
26. run actual application;
27. fix runtime defects.
Do not spend step 2 writing dozens of tests while steps 3–24 remain absent.
======================================================================
BM. RUNTIME VERIFICATION AFTER CODING
======================================================================
Once the production implementation is in place, run the actual application.
Use real available card/scanner images.
Exercise:
upload multiple files;
detect multiple cards;
rectify;
rotate;
upscale;
descratch;
combined descratch + upscale;
compare artifacts;
select multiple cards;
bulk process;
retry one failure;
export selected;
download ZIP;
open ZIP;
parse manifest.
If something fails:
fix production code.
Do not paper over failure with a mock.
======================================================================
BN. FINAL PRODUCT WORKFLOW
======================================================================
The implementation is not complete unless this ACTUAL sequence exists:
USER OPENS CARDENHANCE
↓
POLISHED EMPTY STATE
↓
USER DRAGS 12 IMAGES + 2 SCANNER SHEETS
↓
REAL FILES UPLOAD
↓
BACKEND VALIDATES BYTES
↓
ORIGINALS STORED IMMUTABLY
↓
YOLO DETECTS PHYSICAL CARDS
↓
MULTI-CARD SHEETS SPLIT INTO INDIVIDUAL CARD OBJECTS
↓
CARD CORNERS RECOVERED
↓
PERSPECTIVE CORRECTED
↓
ORIENTATION CORRECTED
↓
THUMBNAIL GRID POPULATES
↓
USER SELECTS CARD
↓
LARGE RECTIFIED IMAGE DISPLAYED
↓
USER CLICKS UPSCALE 2X
↓
REAL REAL-ESRGAN/FALLBACK RESULT GENERATED AND LABELED ACCURATELY
↓
USER SELECTS DESCRATCH MEDIUM
↓
REAL SCRATCH MASK GENERATED
↓
SAFE MASK VALIDATED
↓
REAL DESCRATCHED ARTIFACT CREATED
↓
USER CLICKS DESCRATCH + UPSCALE
↓
REAL COMBINED ARTIFACT CREATED
↓
USER SELECTS BEFORE = RECTIFIED
↓
USER SELECTS AFTER = DESCRATCHED + UPSCALED
↓
BEFORE/AFTER SLIDER DISPLAYS TWO REAL ARTIFACTS
↓
USER ZOOMS INTO CARD DETAIL
↓
USER SELECTS 20 CARDS
↓
BULK DESCRATCH + UPSCALE RUNS WITH BOUNDED CONCURRENCY
↓
ONE FAILURE DOES NOT STOP THE OTHERS
↓
USER RETRIES FAILED CARD
↓
USER EXPORTS SELECTED AS PNG
↓
BACKEND GENERATES REAL ZIP
↓
ZIP CONTAINS REAL PROCESSED IMAGES
↓
ZIP CONTAINS VALID manifest.json
↓
USER DOWNLOADS ZIP
Every arrow must be backed by actual production code.
======================================================================
BO. DO NOT STOP EARLY
======================================================================
Do not stop because:
the backend is finished;
YOLO works;
Real-ESRGAN works;
descratching works;
frontend compiles;
the UI looks nice;
export code exists.
The job is only complete when all of those are connected into the real workflow.
======================================================================
BP. FINAL RESPONSE
======================================================================
Return only concise implementation status.
STATUS:
CODE COMPLETE | PARTIAL | BLOCKED
SOURCE INGESTION:
IMPLEMENTED / NOT IMPLEMENTED
DRAG & DROP:
IMPLEMENTED / NOT IMPLEMENTED
BULK UPLOAD:
IMPLEMENTED / NOT IMPLEMENTED
MULTI-CARD SHEETS:
IMPLEMENTED / NOT IMPLEMENTED
YOLO DETECTION:
IMPLEMENTED / NOT IMPLEMENTED
PERSPECTIVE RECTIFICATION:
IMPLEMENTED / NOT IMPLEMENTED
SMART ORIENTATION:
IMPLEMENTED / NOT IMPLEMENTED
MANUAL ROTATION:
IMPLEMENTED / NOT IMPLEMENTED
UPSCALE:
IMPLEMENTED / NOT IMPLEMENTED
REAL SR IDENTIFICATION:
IMPLEMENTED / NOT IMPLEMENTED
DESCRATCH:
IMPLEMENTED / NOT IMPLEMENTED
SCRATCH-MASK SAFETY:
IMPLEMENTED / NOT IMPLEMENTED
DESCRATCH + UPSCALE:
IMPLEMENTED / NOT IMPLEMENTED
ARTIFACT STORAGE:
IMPLEMENTED / NOT IMPLEMENTED
BEFORE/AFTER SLIDER:
IMPLEMENTED / NOT IMPLEMENTED
ZOOM/PAN:
IMPLEMENTED / NOT IMPLEMENTED
PROFESSIONAL CARD WORKSPACE:
IMPLEMENTED / NOT IMPLEMENTED
BULK PROCESSING:
IMPLEMENTED / NOT IMPLEMENTED
FAILURE ISOLATION:
IMPLEMENTED / NOT IMPLEMENTED
RETRY:
IMPLEMENTED / NOT IMPLEMENTED
INDIVIDUAL EXPORT:
IMPLEMENTED / NOT IMPLEMENTED
BULK EXPORT:
IMPLEMENTED / NOT IMPLEMENTED
ZIP:
IMPLEMENTED / NOT IMPLEMENTED
MANIFEST:
IMPLEMENTED / NOT IMPLEMENTED
MOBILE RESPONSIVENESS:
IMPLEMENTED / NOT IMPLEMENTED
PRODUCTION PLACEHOLDERS:
ZERO
or exact remaining files/lines
FILES CHANGED:
actual production paths only
COMMIT:
actual SHA if committed
PUSH:
actual remote/SHA if pushed
DEPLOYMENT:
actual URL if deployed
BLOCKER:
NONE
or one precise external blocker
Do not finish with a plan.
Do not tell me what still "should be built" if you can build it.
OPEN THE REPOSITORY.
WRITE THE CODE.
CONNECT THE ENTIRE WORKFLOW.
REMOVE THE PLACEHOLDERS.
MAKE IT LOOK PROFESSIONAL.
MAKE THE IMAGE PROCESSING REAL.
MAKE BULK OPERATION REAL.
MAKE THE COMPARISON REAL.
MAKE THE EXPORT REAL.
THE DELIVERABLE IS THE WORKING CARDENHANCE PRODUCT.
