import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Camera,
  Download,
  Expand,
  ImagePlus,
  Loader2,
  RefreshCcw,
  RotateCcw,
  RotateCw,
  Search,
  Sparkles,
  Upload,
  Wand2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { toast } from 'sonner'

import { HolographicBackground } from './HolographicBackground'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import {
  apiService,
  type ArtifactRecord,
  type ArtifactType,
  type BatchRecord,
  type CardRecord,
  type ExportScope,
  type SourceRecord,
} from '@/services/api'

const COMPARISON_OPTIONS: Array<{ value: ArtifactType; label: string }> = [
  { value: 'ORIGINAL_SOURCE', label: 'Original' },
  { value: 'RECTIFIED', label: 'Rectified' },
  { value: 'UPSCALED', label: 'Upscaled' },
  { value: 'DESCRATCHED', label: 'Descratched' },
  { value: 'DESCRATCHED_UPSCALED', label: 'Descratched + Upscaled' },
]

function getArtifactId(card: CardRecord, artifactType: ArtifactType) {
  const mapping: Record<ArtifactType, string | null | undefined> = {
    ORIGINAL_SOURCE: card.original_source_artifact_id,
    RECTIFIED: card.rectified_artifact_id,
    UPSCALED: card.upscaled_artifact_id,
    DESCRATCHED: card.descratched_artifact_id,
    DESCRATCHED_UPSCALED: card.descratched_upscaled_artifact_id,
    OPTIMIZED: null,
  }
  return mapping[artifactType] ?? null
}

function formatStatus(status: string) {
  return status.replaceAll('_', ' ')
}

function artifactLabel(artifactType: ArtifactType) {
  return COMPARISON_OPTIONS.find((option) => option.value === artifactType)?.label ?? artifactType
}

export function ErrorBanner({ message }: { message?: string | null }) {
  if (!message) return null
  return (
    <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100">
      {message}
    </div>
  )
}

export function BatchProgress({ batch }: { batch: BatchRecord | null }) {
  if (!batch) return null
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs uppercase tracking-[0.25em] text-cyan-200/70">
        <span>Batch progress</span>
        <span>{Math.round(batch.progress)}%</span>
      </div>
      <Progress value={batch.progress} className="h-2 bg-white/10" />
    </div>
  )
}

export function DropZone({
  disabled,
  hasBatch,
  sources,
  onFilesSelected,
  addFiles,
  onRetrySource,
  onCancelSource,
}: {
  disabled: boolean
  hasBatch: boolean
  sources: SourceRecord[]
  onFilesSelected: (files: File[]) => Promise<void>
  addFiles: (files: File[]) => Promise<void>
  onRetrySource: (sourceId: string) => Promise<void>
  onCancelSource: (sourceId: string) => Promise<void>
}) {
  const [isDragActive, setIsDragActive] = useState(false)
  const browseRef = useRef<HTMLInputElement | null>(null)
  const mobileRef = useRef<HTMLInputElement | null>(null)
  const cameraRef = useRef<HTMLInputElement | null>(null)

  const handleFiles = useCallback(async (fileList: FileList | null) => {
    if (!fileList?.length) return
    const files = Array.from(fileList)
    if (hasBatch) {
      await addFiles(files)
    } else {
      await onFilesSelected(files)
    }
  }, [addFiles, hasBatch, onFilesSelected])

  return (
    <Card className="glass-card border-cyan-500/15 bg-slate-950/80">
      <CardHeader className="space-y-2">
        <CardTitle className="text-xl text-white">Enhance your cards</CardTitle>
        <p className="text-sm text-slate-300/80">
          Drag card images or multi-card scanner sheets here. CardEnhance validates real bytes, detects each card, rectifies geometry, and prepares restoration artifacts.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          className={cn(
            'drop-zone rounded-2xl border border-dashed border-cyan-400/30 bg-slate-950/60 p-6 transition-all',
            isDragActive && 'drag-over',
            disabled && 'pointer-events-none opacity-70',
          )}
          onDragEnter={(event) => {
            event.preventDefault()
            setIsDragActive(true)
          }}
          onDragOver={(event) => {
            event.preventDefault()
            setIsDragActive(true)
          }}
          onDragLeave={(event) => {
            event.preventDefault()
            if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
            setIsDragActive(false)
          }}
          onDrop={async (event) => {
            event.preventDefault()
            setIsDragActive(false)
            await handleFiles(event.dataTransfer.files)
          }}
        >
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className="rounded-full border border-cyan-400/30 bg-cyan-400/10 p-4">
              <Upload className="size-8 text-cyan-300" />
            </div>
            <div className="space-y-2">
              <p className="text-lg font-semibold text-white">
                {disabled ? 'Uploading and processing...' : isDragActive ? 'Drop files to add them to the batch' : 'Drop images, flatbed sheets, or browse from your device'}
              </p>
              <p className="text-sm text-slate-300/70">JPEG, PNG, WEBP, BMP, TIFF • mobile picker and camera capture supported</p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button className="neon-button border border-cyan-400/30 bg-cyan-400/10 text-cyan-50 hover:bg-cyan-400/20" onClick={() => browseRef.current?.click()} disabled={disabled}>
                <ImagePlus className="mr-2 size-4" />
                Choose images
              </Button>
              <Button variant="outline" className="border-cyan-500/20 bg-black/30 text-cyan-100" onClick={() => mobileRef.current?.click()} disabled={disabled}>
                <Sparkles className="mr-2 size-4" />
                Photo picker
              </Button>
              <Button variant="outline" className="border-cyan-500/20 bg-black/30 text-cyan-100" onClick={() => cameraRef.current?.click()} disabled={disabled}>
                <Camera className="mr-2 size-4" />
                Camera
              </Button>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-300/60">
              <span>{sources.length} sources</span>
              <span>•</span>
              <span>{hasBatch ? 'Ready to add more files' : 'Create a batch on first upload'}</span>
            </div>
          </div>
          <input ref={browseRef} type="file" multiple accept="image/jpeg,image/png,image/webp,image/bmp,image/tiff" className="hidden" onChange={(event) => void handleFiles(event.target.files)} />
          <input ref={mobileRef} type="file" multiple accept="image/jpeg,image/png,image/webp,image/bmp,image/tiff" className="hidden" onChange={(event) => void handleFiles(event.target.files)} />
          <input ref={cameraRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="hidden" onChange={(event) => void handleFiles(event.target.files)} />
        </div>
        {sources.length > 0 && (
          <div className="space-y-2 rounded-xl border border-white/10 bg-black/25 p-3">
            {sources.map((source) => (
              <div key={source.source_id} className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-white">{source.original_filename}</p>
                  <p className="text-xs text-slate-300/60">{source.detected_card_count} cards • {formatStatus(source.status)}</p>
                </div>
                <div className="flex items-center gap-2">
                  {source.status === 'FAILED' && (
                    <Button variant="outline" className="border-red-400/20 bg-red-500/10 px-3 py-1 text-xs text-red-50" onClick={() => void onRetrySource(source.source_id)}>
                      Retry
                    </Button>
                  )}
                  {(source.status === 'UPLOADING' || source.status === 'VALIDATING' || source.status === 'PROCESSING') && (
                    <Button variant="outline" className="border-white/10 bg-black/40 px-3 py-1 text-xs text-white" onClick={() => void onCancelSource(source.source_id)}>
                      Cancel
                    </Button>
                  )}
                  <Badge className={cn('border', source.status === 'FAILED' ? 'border-red-400/40 bg-red-500/10 text-red-100' : 'border-cyan-400/30 bg-cyan-400/10 text-cyan-50')}>
                    {formatStatus(source.status)}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function BatchSummary({ batch, selectedCount }: { batch: BatchRecord | null; selectedCount: number }) {
  const stats = batch ? [
    { label: 'Sources', value: batch.source_count },
    { label: 'Cards', value: batch.detected_card_count },
    { label: 'Processing', value: batch.processing_count + batch.queued_count },
    { label: 'Completed', value: batch.completed_count },
    { label: 'Failed', value: batch.failed_count },
    { label: 'Selected', value: selectedCount },
  ] : []

  return (
    <Card className="glass-card border-white/10 bg-slate-950/80">
      <CardHeader>
        <CardTitle className="text-lg text-white">Batch summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <BatchProgress batch={batch} />
        <div className="grid grid-cols-2 gap-3">
          {stats.map((stat) => (
            <div key={stat.label} className="stat-card rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs uppercase tracking-[0.25em] text-slate-300/60">{stat.label}</p>
              <p className="mt-2 text-2xl font-semibold text-white">{stat.value}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function CardTile({
  card,
  selected,
  active,
  onSelect,
  onToggle,
}: {
  card: CardRecord
  selected: boolean
  active: boolean
  onSelect: () => void
  onToggle: () => void
}) {
  const thumbnailArtifactId = card.rectified_artifact_id ?? card.original_source_artifact_id
  const thumbnailUrl = thumbnailArtifactId ? apiService.getArtifactUrl(thumbnailArtifactId, 'thumbnail') : undefined
  const artifactBadges = [
    card.upscaled_artifact_id ? 'UP' : null,
    card.descratched_artifact_id ? 'DS' : null,
    card.descratched_upscaled_artifact_id ? 'UP+DS' : null,
  ].filter(Boolean)
  return (
    <button
      type="button"
      className={cn(
        'group flex w-full flex-col gap-3 rounded-2xl border p-3 text-left transition-all',
        active ? 'border-cyan-300 bg-cyan-400/10 shadow-[0_0_0_1px_rgba(34,211,238,0.4)]' : 'border-white/10 bg-white/[0.03] hover:border-cyan-400/30 hover:bg-cyan-400/5',
      )}
      onClick={onSelect}
    >
      <div className="sports-card overflow-hidden rounded-xl border border-white/10 bg-black/40">
        {thumbnailUrl ? (
          <img src={thumbnailUrl} alt={`Card ${card.display_index}`} className="aspect-[2.5/3.5] w-full object-cover" />
        ) : (
          <div className="flex aspect-[2.5/3.5] items-center justify-center bg-black/40 text-slate-400">No preview</div>
        )}
      </div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">Card {card.display_index}</p>
          <p className="text-xs text-slate-300/60">Source {card.source_index} • {formatStatus(card.current_stage)}</p>
        </div>
        <input type="checkbox" checked={selected} onChange={onToggle} onClick={(event) => event.stopPropagation()} className="mt-1 h-4 w-4 rounded border-white/20 bg-transparent" />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-slate-300/70">
        <Badge className={cn('border px-2 py-0.5', card.status === 'FAILED' ? 'border-red-400/40 bg-red-500/10 text-red-100' : 'border-emerald-400/20 bg-emerald-500/10 text-emerald-100')}>
          {formatStatus(card.status)}
        </Badge>
        <span>{card.orientation_degrees}°</span>
        {artifactBadges.map((badge) => (
          <span key={badge}>{badge}</span>
        ))}
      </div>
    </button>
  )
}

export function CardGrid({
  cards,
  selectedIds,
  selectedCardId,
  onSelectCard,
  onToggleCardSelection,
}: {
  cards: CardRecord[]
  selectedIds: Set<string>
  selectedCardId: string | null
  onSelectCard: (cardId: string) => void
  onToggleCardSelection: (cardId: string) => void
}) {
  if (cards.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-white/10 bg-slate-950/50 p-8 text-center text-slate-300/70">
        Upload images to populate the detected card grid.
      </div>
    )
  }

  return (
    <ScrollArea className="h-full rounded-2xl border border-white/10 bg-slate-950/60 p-4">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-3 2xl:grid-cols-4">
        {cards.map((card) => (
          <CardTile
            key={card.card_id}
            card={card}
            selected={selectedIds.has(card.card_id)}
            active={selectedCardId === card.card_id}
            onSelect={() => onSelectCard(card.card_id)}
            onToggle={() => onToggleCardSelection(card.card_id)}
          />
        ))}
      </div>
    </ScrollArea>
  )
}

export function ArtifactSelector({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: ArtifactType
  options: ArtifactType[]
  onChange: (value: ArtifactType) => void
}) {
  return (
    <label className="space-y-2 text-sm text-slate-200">
      <span className="text-xs uppercase tracking-[0.2em] text-slate-300/60">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value as ArtifactType)} className="w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-sm text-white outline-none transition focus:border-cyan-400/40">
        {options.map((option) => (
          <option key={option} value={option} className="bg-slate-950 text-white">{artifactLabel(option)}</option>
        ))}
      </select>
    </label>
  )
}

export function BeforeAfterSlider({
  beforeUrl,
  afterUrl,
  scale,
  pan,
}: {
  beforeUrl: string
  afterUrl: string | null
  scale: number
  pan: { x: number; y: number }
}) {
  const [slider, setSlider] = useState(50)
  const [dragging, setDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const updateSlider = useCallback((clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const next = ((clientX - rect.left) / rect.width) * 100
    setSlider(Math.max(0, Math.min(100, next)))
  }, [])

  useEffect(() => {
    if (!dragging) return
    const handleMove = (event: PointerEvent) => updateSlider(event.clientX)
    const handleUp = () => setDragging(false)
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }
  }, [dragging, updateSlider])

  const transform = `translate(${pan.x}px, ${pan.y}px) scale(${scale})`

  return (
    <div ref={containerRef} className="comparison-slider relative aspect-[2.5/3.5] w-full overflow-hidden rounded-2xl bg-black" onPointerDown={(event) => updateSlider(event.clientX)}>
      <img src={beforeUrl} alt="Before" className="absolute inset-0 h-full w-full origin-center object-contain" style={{ transform }} />
      {afterUrl && (
        <div className="absolute inset-0 overflow-hidden" style={{ width: `${slider}%` }}>
          <img src={afterUrl} alt="After" className="absolute inset-0 h-full w-full origin-center object-contain" style={{ transform }} />
        </div>
      )}
      <div className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/70 px-3 py-1 text-xs uppercase tracking-[0.2em] text-white">Before</div>
      {afterUrl && <div className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/70 px-3 py-1 text-xs uppercase tracking-[0.2em] text-white">After</div>}
      {afterUrl && (
        <button
          type="button"
          className="handle absolute top-0 h-full w-1 cursor-ew-resize bg-cyan-300"
          style={{ left: `${slider}%` }}
          onPointerDown={(event) => {
            event.stopPropagation()
            setDragging(true)
            updateSlider(event.clientX)
          }}
          aria-label="Adjust before after comparison"
        />
      )}
    </div>
  )
}

export function ZoomPanViewer({ beforeUrl, afterUrl }: { beforeUrl: string; afterUrl: string | null }) {
  const [scale, setScale] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const dragStart = useRef<{ x: number; y: number } | null>(null)

  return (
    <div className="space-y-3">
      <div
        className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/70 p-4"
        onPointerDown={(event) => {
          dragStart.current = { x: event.clientX - pan.x, y: event.clientY - pan.y }
        }}
        onPointerMove={(event) => {
          if (!dragStart.current) return
          setPan({ x: event.clientX - dragStart.current.x, y: event.clientY - dragStart.current.y })
        }}
        onPointerUp={() => {
          dragStart.current = null
        }}
        onPointerLeave={() => {
          dragStart.current = null
        }}
      >
        <BeforeAfterSlider beforeUrl={beforeUrl} afterUrl={afterUrl} scale={scale} pan={pan} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" className="border-white/10 bg-black/40 text-white" onClick={() => setScale((value) => Math.min(4, Number((value + 0.25).toFixed(2))))}><ZoomIn className="mr-2 size-4" />Zoom in</Button>
        <Button variant="outline" className="border-white/10 bg-black/40 text-white" onClick={() => setScale((value) => Math.max(1, Number((value - 0.25).toFixed(2))))}><ZoomOut className="mr-2 size-4" />Zoom out</Button>
        <Button variant="outline" className="border-white/10 bg-black/40 text-white" onClick={() => { setScale(1); setPan({ x: 0, y: 0 }) }}><Search className="mr-2 size-4" />Reset</Button>
        <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-xs uppercase tracking-[0.2em] text-slate-200">{Math.round(scale * 100)}%</span>
      </div>
    </div>
  )
}

function OrientationControls({ onRotate }: { onRotate: (degrees: 0 | 90 | 180 | 270) => Promise<void> }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Button variant="outline" className="border-white/10 bg-black/40 text-white" onClick={() => void onRotate(270)}><RotateCcw className="mr-2 size-4" />Rotate left</Button>
      <Button variant="outline" className="border-white/10 bg-black/40 text-white" onClick={() => void onRotate(90)}><RotateCw className="mr-2 size-4" />Rotate right</Button>
      {[0, 90, 180, 270].map((value) => (
        <Button key={value} variant="outline" className="border-white/10 bg-black/40 text-white" onClick={() => void onRotate(value as 0 | 90 | 180 | 270)}>{value}°</Button>
      ))}
    </div>
  )
}

function EnhancementControls({
  onUpscale,
  onDescratch,
  onCombined,
  onRetry,
}: {
  onUpscale: (scale: 2 | 4) => Promise<void>
  onDescratch: (strength: 'low' | 'medium' | 'high') => Promise<void>
  onCombined: (strength: 'low' | 'medium' | 'high', scale: 2 | 4) => Promise<void>
  onRetry: () => Promise<void>
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-300/60">Upscale</p>
        <div className="grid grid-cols-2 gap-2">
          <Button className="neon-button border border-cyan-400/30 bg-cyan-400/10 text-cyan-50" onClick={() => void onUpscale(2)}>Upscale 2x</Button>
          <Button className="neon-button border border-cyan-400/30 bg-cyan-400/10 text-cyan-50" onClick={() => void onUpscale(4)}>Upscale 4x</Button>
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-300/60">Descratch</p>
        <div className="grid grid-cols-3 gap-2">
          {(['low', 'medium', 'high'] as const).map((strength) => (
            <Button key={strength} variant="outline" className="border-white/10 bg-black/40 text-white" onClick={() => void onDescratch(strength)}>{strength}</Button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-300/60">Descratch + upscale</p>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" className="border-white/10 bg-black/40 text-white" onClick={() => void onCombined('medium', 2)}><Wand2 className="mr-2 size-4" />Medium + 2x</Button>
          <Button variant="outline" className="border-white/10 bg-black/40 text-white" onClick={() => void onCombined('medium', 4)}><Wand2 className="mr-2 size-4" />Medium + 4x</Button>
        </div>
      </div>
      <Button variant="outline" className="w-full border-red-400/20 bg-red-500/10 text-red-50" onClick={() => void onRetry()}><RefreshCcw className="mr-2 size-4" />Retry card</Button>
    </div>
  )
}

export function BulkActionBar({
  selectedCount,
  onSelectAll,
  onSelectCompleted,
  onClear,
  onUpscaleSelected,
  onDescratchSelected,
  onCombinedSelected,
  onRetryFailed,
  onExportSelected,
}: {
  selectedCount: number
  onSelectAll: () => void
  onSelectCompleted: () => void
  onClear: () => void
  onUpscaleSelected: (scale: 2 | 4) => Promise<void>
  onDescratchSelected: (strength: 'low' | 'medium' | 'high') => Promise<void>
  onCombinedSelected: (strength: 'low' | 'medium' | 'high', scale: 2 | 4) => Promise<void>
  onRetryFailed: () => Promise<void>
  onExportSelected: () => void
}) {
  return (
    <Card className="glass-card border-white/10 bg-slate-950/80">
      <CardContent className="flex flex-col gap-3 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-white">
          <span>{selectedCount} selected</span>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" className="text-slate-200 hover:text-white" onClick={onSelectAll}>Select all</Button>
            <Button variant="ghost" className="text-slate-200 hover:text-white" onClick={onSelectCompleted}>Select completed</Button>
            <Button variant="ghost" className="text-slate-200 hover:text-white" onClick={onClear}>Clear</Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button className="neon-button border border-cyan-400/30 bg-cyan-400/10 text-cyan-50" onClick={() => void onUpscaleSelected(2)}>Upscale selected</Button>
          <Button variant="outline" className="border-white/10 bg-black/40 text-white" onClick={() => void onDescratchSelected('medium')}>Descratch selected</Button>
          <Button variant="outline" className="border-white/10 bg-black/40 text-white" onClick={() => void onCombinedSelected('medium', 2)}>Descratch + Upscale</Button>
          <Button variant="outline" className="border-white/10 bg-black/40 text-white" onClick={() => void onRetryFailed()}>Retry failed</Button>
          <Button variant="outline" className="border-white/10 bg-black/40 text-white" onClick={onExportSelected}><Download className="mr-2 size-4" />Export selected</Button>
        </div>
      </CardContent>
    </Card>
  )
}

export function ExportDialog({
  open,
  batchId,
  currentCard,
  selectedCardIds,
  onClose,
}: {
  open: boolean
  batchId: string | null
  currentCard: CardRecord | null
  selectedCardIds: string[]
  onClose: () => void
}) {
  const [scope, setScope] = useState<ExportScope>('selected_cards')
  const [artifactType, setArtifactType] = useState<ArtifactType>('RECTIFIED')
  const [format, setFormat] = useState<'png' | 'jpg' | 'webp'>('png')
  const [quality, setQuality] = useState(95)
  const [submitting, setSubmitting] = useState(false)
  const currentCardId = currentCard?.card_id ?? null

  async function submit() {
    if (!batchId) return
    setSubmitting(true)
    try {
      const exportRecord = await apiService.createExport({
        batch_id: batchId,
        scope,
        artifact_type: artifactType,
        format,
        quality: format === 'png' ? undefined : quality,
        card_ids: selectedCardIds,
        current_card_id: currentCardId ?? undefined,
      })
      window.open(apiService.getExportUrl(exportRecord.export_id), '_blank', 'noopener,noreferrer')
      toast.success('Export created.')
      onClose()
    } catch {
      toast.error('Export could not be created.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="max-w-xl border border-cyan-500/20 bg-slate-950 text-white">
        <DialogHeader>
          <DialogTitle>Export cards</DialogTitle>
          <DialogDescription className="text-slate-300/70">Choose the scope, artifact version, and output format for a real file or ZIP export with manifest.json.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2 text-sm">
            <span className="text-xs uppercase tracking-[0.2em] text-slate-300/60">Scope</span>
            <select value={scope} onChange={(event) => setScope(event.target.value as ExportScope)} className="w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-white">
              <option value="current_card">Current card</option>
              <option value="selected_cards">Selected cards</option>
              <option value="all_completed">All completed</option>
            </select>
          </label>
          <label className="space-y-2 text-sm">
            <span className="text-xs uppercase tracking-[0.2em] text-slate-300/60">Artifact</span>
            <select value={artifactType} onChange={(event) => setArtifactType(event.target.value as ArtifactType)} className="w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-white">
              {COMPARISON_OPTIONS.filter((option) => option.value !== 'OPTIMIZED').map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="space-y-2 text-sm">
            <span className="text-xs uppercase tracking-[0.2em] text-slate-300/60">Format</span>
            <select value={format} onChange={(event) => setFormat(event.target.value as 'png' | 'jpg' | 'webp')} className="w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-white">
              <option value="png">PNG</option>
              <option value="jpg">JPEG</option>
              <option value="webp">WEBP</option>
            </select>
          </label>
          {format !== 'png' && (
            <label className="space-y-2 text-sm">
              <span className="text-xs uppercase tracking-[0.2em] text-slate-300/60">Quality</span>
              <input type="range" min={50} max={100} value={quality} onChange={(event) => setQuality(Number(event.target.value))} className="w-full" />
              <p className="text-xs text-slate-300/60">{quality}</p>
            </label>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" className="border-white/10 bg-black/40 text-white" onClick={onClose}>Cancel</Button>
          <Button className="neon-button border border-cyan-400/30 bg-cyan-400/10 text-cyan-50" disabled={submitting} onClick={() => void submit()}>
            {submitting ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Download className="mr-2 size-4" />}
            Export
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function CardWorkspace({
  card,
  artifacts,
  source,
  loading,
  onRotate,
  onUpscale,
  onDescratch,
  onCombined,
  onRetry,
}: {
  card: CardRecord | null
  artifacts: Record<string, ArtifactRecord | null>
  source: SourceRecord | null
  loading: boolean
  onRotate: (degrees: 0 | 90 | 180 | 270) => Promise<void>
  onUpscale: (scale: 2 | 4) => Promise<void>
  onDescratch: (strength: 'low' | 'medium' | 'high') => Promise<void>
  onCombined: (strength: 'low' | 'medium' | 'high', scale: 2 | 4) => Promise<void>
  onRetry: () => Promise<void>
}) {
  const [beforeArtifact, setBeforeArtifact] = useState<ArtifactType>('RECTIFIED')
  const [afterArtifact, setAfterArtifact] = useState<ArtifactType>('DESCRATCHED_UPSCALED')
  const [fullscreenOpen, setFullscreenOpen] = useState(false)

  if (!card || !source) {
    return (
      <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-white/10 bg-slate-950/50 p-8 text-center text-slate-300/70">
        Select a card to inspect geometry, orientation, restoration artifacts, and export options.
      </div>
    )
  }

  const availableOptions = COMPARISON_OPTIONS.filter((option) => getArtifactId(card, option.value))
  const effectiveBeforeArtifact = getArtifactId(card, beforeArtifact)
    ? beforeArtifact
    : (['RECTIFIED', 'ORIGINAL_SOURCE'] as ArtifactType[]).find((type) => getArtifactId(card, type)) ?? 'RECTIFIED'
  const effectiveAfterArtifact = getArtifactId(card, afterArtifact)
    ? afterArtifact
    : (['DESCRATCHED_UPSCALED', 'DESCRATCHED', 'UPSCALED', 'RECTIFIED', 'ORIGINAL_SOURCE'] as ArtifactType[]).find((type) => getArtifactId(card, type)) ?? effectiveBeforeArtifact
  const beforeId = getArtifactId(card, effectiveBeforeArtifact)
  const beforeUrl = beforeId ? apiService.getArtifactUrl(beforeId, 'preview') : null
  const afterId = getArtifactId(card, effectiveAfterArtifact)
  const afterUrl = afterId ? apiService.getArtifactUrl(afterId, 'preview') : null

  return (
    <Card className="glass-card h-full border-white/10 bg-slate-950/80">
      <CardHeader className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-xl text-white">Card {card.display_index}</CardTitle>
            <p className="text-sm text-slate-300/70">{source.original_filename}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.2em]">
            <Badge className="border border-cyan-400/30 bg-cyan-400/10 text-cyan-50">{formatStatus(card.current_stage)}</Badge>
            <Badge className={cn('border', card.status === 'FAILED' ? 'border-red-400/40 bg-red-500/10 text-red-100' : 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100')}>{formatStatus(card.status)}</Badge>
          </div>
        </div>
        <BatchProgress batch={{
          batch_id: card.batch_id,
          status: 'PROCESSING',
          source_count: 0,
          detected_card_count: 1,
          queued_count: 0,
          processing_count: card.status === 'PROCESSING' ? 1 : 0,
          completed_count: card.status === 'READY' || card.status === 'COMPLETED' ? 1 : 0,
          failed_count: card.status === 'FAILED' ? 1 : 0,
          cancelled_count: 0,
          progress: card.progress,
          created_at: card.created_at,
          updated_at: card.updated_at,
          source_ids: [],
          card_ids: [card.card_id],
        }} />
      </CardHeader>
      <CardContent className="flex h-[calc(100%-8rem)] flex-col gap-4 overflow-hidden">
        <div className="grid gap-3 md:grid-cols-2">
          <ArtifactSelector label="Before" value={effectiveBeforeArtifact} options={availableOptions.map((option) => option.value)} onChange={setBeforeArtifact} />
          <ArtifactSelector label="After" value={effectiveAfterArtifact} options={availableOptions.map((option) => option.value)} onChange={setAfterArtifact} />
        </div>
        <ErrorBanner message={card.error_message || source.error_message || (card.warnings[0] ?? null)} />
        {loading && (
          <div className="flex items-center gap-2 rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-3 py-2 text-sm text-cyan-50">
            <Loader2 className="size-4 animate-spin" />
            Refreshing card artifacts...
          </div>
        )}
        {beforeUrl ? (
          <div className="min-h-0 flex-1 overflow-hidden">
            <ZoomPanViewer beforeUrl={beforeUrl} afterUrl={afterUrl} />
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-white/10 bg-slate-950/50 text-slate-300/70">No viewable artifact is ready yet.</div>
        )}
        <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
          <div className="space-y-4 rounded-2xl border border-white/10 bg-black/25 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-white">Orientation</p>
              <Button variant="outline" className="border-white/10 bg-black/40 text-white" onClick={() => setFullscreenOpen(true)}><Expand className="mr-2 size-4" />Fullscreen</Button>
            </div>
            <OrientationControls onRotate={onRotate} />
          </div>
          <div className="space-y-4 rounded-2xl border border-white/10 bg-black/25 p-4">
            <p className="text-sm font-semibold text-white">Enhancement controls</p>
            <EnhancementControls onUpscale={onUpscale} onDescratch={onDescratch} onCombined={onCombined} onRetry={onRetry} />
          </div>
        </div>
        <div className="grid gap-2 rounded-2xl border border-white/10 bg-black/25 p-4 text-sm text-slate-200 md:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-300/60">Detection</p>
            <p>{card.detector_method} • {Math.round(card.detection_confidence * 100)}%</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-300/60">Geometry</p>
            <p>{card.geometry_method} • {Math.round(card.geometry_confidence * 100)}%</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-300/60">Orientation</p>
            <p>{card.orientation_degrees}° • {card.orientation_method}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-300/60">SR identification</p>
            <p>{artifacts.UPSCALED?.processing_parameters?.used_real_sr ? 'AI super-resolution' : artifacts.UPSCALED ? 'Fallback resize' : 'Not generated'}</p>
          </div>
        </div>
        <Dialog open={fullscreenOpen} onOpenChange={setFullscreenOpen}>
          <DialogContent className="max-w-6xl border border-cyan-500/20 bg-slate-950 text-white">
            <DialogHeader>
              <DialogTitle>Card detail viewer</DialogTitle>
              <DialogDescription className="text-slate-300/70">Inspect the selected before/after artifact pair at full workspace size.</DialogDescription>
            </DialogHeader>
            {beforeUrl && <ZoomPanViewer beforeUrl={beforeUrl} afterUrl={afterUrl} />}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}

export function CardEnhancePage() {
  const [batch, setBatch] = useState<BatchRecord | null>(null)
  const [sources, setSources] = useState<SourceRecord[]>([])
  const [cards, setCards] = useState<CardRecord[]>([])
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [cardDetail, setCardDetail] = useState<{ card: CardRecord; source: SourceRecord; artifacts: Record<string, ArtifactRecord | null> } | null>(null)
  const [loadingBatch, setLoadingBatch] = useState(false)
  const [loadingCard, setLoadingCard] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)

  const refreshBatch = useCallback(async (batchId: string) => {
    const next = await apiService.getBatch(batchId)
    setBatch(next.batch)
    setSources(next.sources)
    setCards(next.cards)
    if (!selectedCardId && next.cards.length > 0) {
      setSelectedCardId(next.cards[0].card_id)
    }
    return next
  }, [selectedCardId])

  const refreshCard = useCallback(async (cardId: string) => {
    setLoadingCard(true)
    try {
      const detail = await apiService.getCard(cardId)
      setCardDetail(detail)
    } finally {
      setLoadingCard(false)
    }
  }, [])

  useEffect(() => {
    if (!selectedCardId) return
    void refreshCard(selectedCardId)
  }, [refreshCard, selectedCardId])

  useEffect(() => {
    if (!batch) return
    const active = batch.status === 'UPLOADING' || batch.status === 'PROCESSING' || batch.status === 'QUEUED'
    if (!active) return
    const interval = window.setInterval(() => {
      void refreshBatch(batch.batch_id)
      if (selectedCardId) {
        void refreshCard(selectedCardId)
      }
    }, 2000)
    return () => window.clearInterval(interval)
  }, [batch, refreshBatch, refreshCard, selectedCardId])

  const ensureBatch = useCallback(async () => {
    if (batch) return batch
    const created = await apiService.createBatch()
    setBatch(created)
    return created
  }, [batch])

  const uploadFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return
    setLoadingBatch(true)
    try {
      const activeBatch = await ensureBatch()
      await apiService.addSources(activeBatch.batch_id, files)
      await refreshBatch(activeBatch.batch_id)
      toast.success(`Added ${files.length} source files.`)
    } catch {
      toast.error('Could not upload these images.')
    } finally {
      setLoadingBatch(false)
    }
  }, [ensureBatch, refreshBatch])

  const toggleCardSelection = useCallback((cardId: string) => {
    setSelectedIds((previous) => {
      const next = new Set(previous)
      if (next.has(cardId)) next.delete(cardId)
      else next.add(cardId)
      return next
    })
  }, [])

  const selectAll = useCallback(() => setSelectedIds(new Set(cards.map((card) => card.card_id))), [cards])
  const selectCompleted = useCallback(() => setSelectedIds(new Set(cards.filter((card) => card.status === 'READY' || card.status === 'COMPLETED').map((card) => card.card_id))), [cards])
  const clearSelection = useCallback(() => setSelectedIds(new Set()), [])

  const runSelectedOperation = useCallback(async (operation: 'upscale' | 'descratch' | 'descratch_upscale', parameters: Record<string, unknown>) => {
    if (!batch || selectedIds.size === 0) return
    try {
      await apiService.processSelected(batch.batch_id, Array.from(selectedIds), operation, parameters)
      toast.success(`Queued ${operation.replaceAll('_', ' ')} for ${selectedIds.size} cards.`)
      await refreshBatch(batch.batch_id)
    } catch {
      toast.error('Bulk action failed.')
    }
  }, [batch, refreshBatch, selectedIds])

  const selectedCard = useMemo(() => cards.find((card) => card.card_id === selectedCardId) ?? null, [cards, selectedCardId])

  return (
    <div className="min-h-screen bg-black text-white noise-overlay">
      <HolographicBackground />
      <div className="relative z-10 flex min-h-screen flex-col">
        <header className="glass-dark border-b border-cyan-500/20 px-6 py-4">
          <div className="mx-auto flex max-w-[1800px] items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold"><span className="holographic-text">Card</span>Enhance</h1>
              <p className="text-sm uppercase tracking-[0.3em] text-cyan-200/60">Sports-card scanning and restoration workspace</p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              {batch && <Badge className="border border-cyan-400/30 bg-cyan-400/10 text-cyan-50">{formatStatus(batch.status)}</Badge>}
              <Button className="neon-button border border-cyan-400/30 bg-cyan-400/10 text-cyan-50" disabled={!batch} onClick={() => setExportOpen(true)}><Download className="mr-2 size-4" />Export</Button>
            </div>
          </div>
        </header>
        <main className="mx-auto flex w-full max-w-[1800px] flex-1 flex-col gap-4 px-4 py-4 lg:grid lg:grid-cols-[320px_minmax(0,1fr)_520px] lg:items-start">
          <div className="space-y-4 lg:sticky lg:top-4">
            <DropZone
              disabled={loadingBatch}
              hasBatch={Boolean(batch)}
              sources={sources}
              onFilesSelected={uploadFiles}
              addFiles={uploadFiles}
              onRetrySource={async (sourceId) => {
                if (!batch) return
                await apiService.retrySource(sourceId)
                toast.success('Queued source retry.')
                await refreshBatch(batch.batch_id)
              }}
              onCancelSource={async (sourceId) => {
                if (!batch) return
                await apiService.cancelSource(sourceId)
                toast.success('Source cancelled.')
                await refreshBatch(batch.batch_id)
              }}
            />
            <BatchSummary batch={batch} selectedCount={selectedIds.size} />
          </div>
          <div className="space-y-4">
            <BulkActionBar
              selectedCount={selectedIds.size}
              onSelectAll={selectAll}
              onSelectCompleted={selectCompleted}
              onClear={clearSelection}
              onUpscaleSelected={async (scale) => runSelectedOperation('upscale', { scale })}
              onDescratchSelected={async (strength) => runSelectedOperation('descratch', { strength })}
              onCombinedSelected={async (strength, scale) => runSelectedOperation('descratch_upscale', { strength, scale })}
              onRetryFailed={async () => {
                if (!batch) return
                await apiService.retryFailed(batch.batch_id)
                toast.success('Queued retries for failed cards.')
                await refreshBatch(batch.batch_id)
              }}
              onExportSelected={() => setExportOpen(true)}
            />
            <div className="h-[70vh] min-h-[520px]">
              <CardGrid cards={cards} selectedIds={selectedIds} selectedCardId={selectedCardId} onSelectCard={setSelectedCardId} onToggleCardSelection={toggleCardSelection} />
            </div>
          </div>
          <div className="h-[80vh] min-h-[720px]">
            <CardWorkspace
              card={cardDetail?.card ?? selectedCard}
              artifacts={cardDetail?.artifacts ?? {}}
              source={cardDetail?.source ?? sources.find((source) => source.source_id === selectedCard?.source_id) ?? null}
              loading={loadingCard}
              onRotate={async (degrees) => {
                if (!selectedCardId || !batch) return
                await apiService.rotateCard(selectedCardId, degrees)
                await refreshBatch(batch.batch_id)
                await refreshCard(selectedCardId)
              }}
              onUpscale={async (scale) => {
                if (!selectedCardId || !batch) return
                await apiService.requestUpscale(selectedCardId, scale)
                toast.success(`Queued ${scale}x upscale.`)
                await refreshBatch(batch.batch_id)
              }}
              onDescratch={async (strength) => {
                if (!selectedCardId || !batch) return
                await apiService.requestDescratch(selectedCardId, strength)
                toast.success(`Queued ${strength} descratch.`)
                await refreshBatch(batch.batch_id)
              }}
              onCombined={async (strength, scale) => {
                if (!selectedCardId || !batch) return
                await apiService.requestDescratchUpscale(selectedCardId, strength, scale)
                toast.success(`Queued descratch + ${scale}x upscale.`)
                await refreshBatch(batch.batch_id)
              }}
              onRetry={async () => {
                if (!selectedCardId || !batch) return
                await apiService.retryCard(selectedCardId)
                toast.success('Queued retry for selected card.')
                await refreshBatch(batch.batch_id)
              }}
            />
          </div>
        </main>
        <ExportDialog open={exportOpen} batchId={batch?.batch_id ?? null} currentCard={selectedCard} selectedCardIds={Array.from(selectedIds)} onClose={() => setExportOpen(false)} />
      </div>
    </div>
  )
}
