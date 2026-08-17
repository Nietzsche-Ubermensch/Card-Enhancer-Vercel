import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Download, Eye, Trash2, Clock, CheckCircle, RotateCw,
  AlertCircle, Loader2, Image as ImageIcon, Cpu, Activity, Package
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { ProcessingJob } from '../App';
import type { CardImageInfo } from '../services/api';

interface JobMonitorProps {
  jobs: ProcessingJob[];
  onDownload: (job: ProcessingJob) => void;
  onPreview: (job: ProcessingJob) => void;
  onDelete: (jobId: string) => void;
  onRetry: (job: ProcessingJob) => void;
  onExport: (job: ProcessingJob, selectedIds?: string[]) => void;
}

function StatusBadge({ status }: { status: string }) {
  const configs: Record<string, { icon: React.ReactNode; className: string; label: string }> = {
    pending: { icon: <Clock className="w-3 h-3" />, className: 'bg-orange-500/20 text-orange-400 border-orange-500/30', label: 'PENDING' },
    queued: { icon: <Clock className="w-3 h-3" />, className: 'bg-orange-500/20 text-orange-400 border-orange-500/30', label: 'QUEUED' },
    validating: { icon: <Loader2 className="w-3 h-3 animate-spin" />, className: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30', label: 'VALIDATING' },
    processing: { icon: <Loader2 className="w-3 h-3 animate-spin" />, className: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30 energy-pulse', label: 'PROCESSING' },
    retrying: { icon: <RotateCw className="w-3 h-3 animate-spin" />, className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', label: 'RETRYING' },
    completed: { icon: <CheckCircle className="w-3 h-3" />, className: 'bg-green-500/20 text-green-400 border-green-500/30', label: 'COMPLETE' },
    failed: { icon: <AlertCircle className="w-3 h-3" />, className: 'bg-red-500/20 text-red-400 border-red-500/30', label: 'FAILED' },
    cancelled: { icon: <AlertCircle className="w-3 h-3" />, className: 'bg-gray-500/20 text-gray-400 border-gray-500/30', label: 'CANCELLED' },
  };
  const config = configs[status] || configs.pending;
  return (
    <Badge variant="outline" className={`${config.className} flex items-center gap-1.5 tracking-wider text-xs font-medium`}>
      {config.icon}
      {config.label}
    </Badge>
  );
}

// Circular progress indicator
function ProgressRing({ progress, size = 48, strokeWidth = 4 }: { progress: number; size?: number; strokeWidth?: number }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (progress / 100) * circumference;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="progress-ring" width={size} height={size}>
        <circle className="stroke-gray-800" strokeWidth={strokeWidth} fill="transparent" r={radius} cx={size / 2} cy={size / 2} />
        <circle className="progress-ring-circle" stroke="url(#progressGradient)" strokeWidth={strokeWidth} fill="transparent" r={radius} cx={size / 2} cy={size / 2}
          style={{ strokeDasharray: circumference, strokeDashoffset: offset }} />
        <defs>
          <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#00ffff" />
            <stop offset="100%" stopColor="#ff00ff" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xs font-bold mono text-cyan-400">{Math.round(progress)}%</span>
      </div>
    </div>
  );
}

// Per-card row with state, selection, and metadata.
function CardRow({
  card, selected, onToggle,
}: {
  card: CardImageInfo;
  selected: boolean;
  onToggle: () => void;
}) {
  const state = card.card_state || 'queued';
  const isDone = state === 'completed';
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-black/30 border border-cyan-500/10 hover:border-cyan-500/30 transition-colors">
      <Checkbox
        checked={selected}
        onCheckedChange={onToggle}
        disabled={!isDone}
        aria-label={`select ${card.filename}`}
        className="border-cyan-500/40"
      />
      <ImageIcon className="w-4 h-4 text-gray-600 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs truncate font-medium">{card.filename}</p>
        <div className="flex items-center gap-2 text-[10px] text-gray-500 mono">
          {card.orientation && (
            <span>{card.orientation.orientation_degrees}° {card.orientation.orientation_method}</span>
          )}
          {typeof card.crop_confidence === 'number' && (
            <span>crop {(card.crop_confidence * 100).toFixed(0)}%</span>
          )}
        </div>
      </div>
      {card.error_message && (
        <span className="text-[10px] text-red-400 truncate max-w-[120px]" title={card.error_message}>
          {card.error_message}
        </span>
      )}
      <StatusBadge status={state} />
    </div>
  );
}

function JobCard({
  job, onDownload, onPreview, onDelete, onRetry, onExport,
}: {
  job: ProcessingJob;
  onDownload: (job: ProcessingJob) => void;
  onPreview: (job: ProcessingJob) => void;
  onDelete: (jobId: string) => void;
  onRetry: (job: ProcessingJob) => void;
  onExport: (job: ProcessingJob, selectedIds?: string[]) => void;
}) {
  const isComplete = job.status === 'completed';
  const isProcessing = job.status === 'processing';
  const isFailed = job.status === 'failed';

  const cards = job.cards || [];
  const completedCards = cards.filter(c => c.card_state === 'completed');
  const failedCards = cards.filter(c => c.card_state === 'failed');

  const [selected, setSelected] = useState<Set<string>>(new Set());

  const allCompletedSelected = useMemo(
    () => completedCards.length > 0 && completedCards.every(c => selected.has(c.id)),
    [completedCards, selected]
  );

  const toggleAll = () => {
    if (allCompletedSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(completedCards.map(c => c.id)));
    }
  };

  const toggleOne = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="glass-card rounded-xl p-5 card-hover relative overflow-hidden"
    >
      <div className={`absolute top-0 left-0 right-0 h-0.5 ${
        isComplete ? 'bg-gradient-to-r from-green-500 to-cyan-500' :
        isProcessing ? 'bg-gradient-to-r from-cyan-500 to-magenta-500 shimmer' :
        isFailed ? 'bg-gradient-to-r from-red-500 to-orange-500' :
        'bg-gradient-to-r from-orange-500 to-yellow-500'
      }`} />

      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-4">
          {isProcessing ? (
            <ProgressRing progress={job.progress} />
          ) : (
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center border ${
              isComplete ? 'bg-green-500/10 border-green-500/30' :
              isFailed ? 'bg-red-500/10 border-red-500/30' :
              'bg-orange-500/10 border-orange-500/30'
            }`}>
              {isComplete ? <CheckCircle className="w-6 h-6 text-green-400" />
                : isFailed ? <AlertCircle className="w-6 h-6 text-red-400" />
                : <Clock className="w-6 h-6 text-orange-400" />}
            </div>
          )}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h4 className="font-semibold tracking-wide">BATCH</h4>
              <span className="mono text-cyan-400 text-sm">{job.id.slice(0, 8).toUpperCase()}</span>
            </div>
            <p className="text-xs text-gray-500 flex items-center gap-2">
              <ImageIcon className="w-3 h-3" />
              <span>{job.files.length} card(s)</span>
              {completedCards.length > 0 && (
                <span className="text-green-400">{completedCards.length} done</span>
              )}
              {failedCards.length > 0 && (
                <span className="text-red-400">{failedCards.length} failed</span>
              )}
            </p>
          </div>
        </div>
        <StatusBadge status={job.status} />
      </div>

      {/* Progress bar */}
      <div className="mb-4">
        <div className="h-1.5 bg-gray-800/50 rounded-full overflow-hidden">
          <motion.div
            className={`h-full rounded-full ${
              isComplete ? 'bg-gradient-to-r from-green-500 to-cyan-500' :
              isFailed ? 'bg-gradient-to-r from-red-500 to-orange-500' :
              'shimmer'
            }`}
            initial={{ width: 0 }}
            animate={{ width: `${job.progress}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </div>
        {isProcessing && (
          <div className="flex items-center justify-center mt-3 text-xs text-cyan-400/80">
            <Activity className="w-3 h-3 mr-2 animate-pulse" />
            <span className="tracking-wider">PROCESSING CARDS</span>
          </div>
        )}
      </div>

      {/* Per-card list with selection */}
      {cards.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500 tracking-wider">CARDS ({cards.length})</span>
            {completedCards.length > 0 && (
              <button
                onClick={toggleAll}
                className="text-xs text-cyan-400 hover:text-cyan-300 tracking-wider"
              >
                {allCompletedSelected ? 'DESELECT ALL' : 'SELECT ALL'}
              </button>
            )}
          </div>
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {cards.map(card => (
              <CardRow
                key={card.id}
                card={card}
                selected={selected.has(card.id)}
                onToggle={() => toggleOne(card.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {selected.size > 0 && (
          <Button
            variant="outline" size="sm"
            className="flex-1 border-cyan-500/30 hover:bg-cyan-500/10 text-cyan-400 tracking-wider"
            onClick={() => onExport(job, Array.from(selected))}
          >
            <Package className="w-4 h-4 mr-2" />
            EXPORT SELECTED ({selected.size})
          </Button>
        )}
        {completedCards.length > 0 && (
          <Button
            variant="outline" size="sm"
            className="flex-1 border-green-500/30 hover:bg-green-500/10 text-green-400 tracking-wider"
            onClick={() => onExport(job)}
          >
            <Download className="w-4 h-4 mr-2" />
            EXPORT ALL ({completedCards.length})
          </Button>
        )}
        {failedCards.length > 0 && (
          <Button
            variant="outline" size="sm"
            className="flex-1 border-yellow-500/30 hover:bg-yellow-500/10 text-yellow-400 tracking-wider"
            onClick={() => onRetry(job)}
          >
            <RotateCw className="w-4 h-4 mr-2" />
            RETRY FAILED ({failedCards.length})
          </Button>
        )}
        {isComplete && cards.length === 0 && (
          <>
            <Button variant="outline" size="sm"
              className="flex-1 border-cyan-500/30 hover:bg-cyan-500/10 text-cyan-400 tracking-wider"
              onClick={() => onPreview(job)}>
              <Eye className="w-4 h-4 mr-2" /> PREVIEW
            </Button>
            <Button variant="outline" size="sm"
              className="flex-1 border-green-500/30 hover:bg-green-500/10 text-green-400 tracking-wider"
              onClick={() => onDownload(job)}>
              <Download className="w-4 h-4 mr-2" /> DOWNLOAD
            </Button>
          </>
        )}
        <Button variant="ghost" size="sm"
          className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
          onClick={() => onDelete(job.id)}>
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>

      {isFailed && job.error && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
          className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-400 mono">{job.error}</p>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

export function JobMonitor({ jobs, onDownload, onPreview, onDelete, onRetry, onExport }: JobMonitorProps) {
  const processingJobs = jobs.filter(j => j.status === 'processing' || j.status === 'pending');
  const completedJobs = jobs.filter(j => j.status === 'completed');
  const failedJobs = jobs.filter(j => j.status === 'failed');

  if (jobs.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
          <div className="relative w-24 h-24 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full bg-gray-800/30 animate-pulse" />
            <div className="relative w-full h-full rounded-full border border-gray-700 flex items-center justify-center">
              <Cpu className="w-10 h-10 text-gray-600" />
            </div>
          </div>
          <h3 className="text-xl font-semibold mb-2 tracking-wide text-gray-400">NO ACTIVE JOBS</h3>
          <p className="text-sm text-gray-600 tracking-wide">Upload cards to start processing</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold tracking-wider mb-1">
            <span className="holographic-text">BATCH</span>
            <span className="text-white/90 ml-2">MONITOR</span>
          </h2>
          <p className="text-sm text-gray-500 tracking-wide">Track card processing in real-time</p>
        </div>
        <div className="flex gap-3">
          {processingJobs.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30">
              <Loader2 className="w-3 h-3 animate-spin text-cyan-400" />
              <span className="text-cyan-400 text-sm font-medium tracking-wider">{processingJobs.length} ACTIVE</span>
            </div>
          )}
          {completedJobs.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/30">
              <CheckCircle className="w-3 h-3 text-green-400" />
              <span className="text-green-400 text-sm font-medium tracking-wider">{completedJobs.length} DONE</span>
            </div>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1 pr-4">
        <div className="space-y-4">
          <AnimatePresence>
            {processingJobs.map(job => (
              <JobCard key={job.id} job={job} onDownload={onDownload} onPreview={onPreview} onDelete={onDelete} onRetry={onRetry} onExport={onExport} />
            ))}
          </AnimatePresence>
          <AnimatePresence>
            {completedJobs.map(job => (
              <JobCard key={job.id} job={job} onDownload={onDownload} onPreview={onPreview} onDelete={onDelete} onRetry={onRetry} onExport={onExport} />
            ))}
          </AnimatePresence>
          <AnimatePresence>
            {failedJobs.map(job => (
              <JobCard key={job.id} job={job} onDownload={onDownload} onPreview={onPreview} onDelete={onDelete} onRetry={onRetry} onExport={onExport} />
            ))}
          </AnimatePresence>
        </div>
      </ScrollArea>
    </div>
  );
}
