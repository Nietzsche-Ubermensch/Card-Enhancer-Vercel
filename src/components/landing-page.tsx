import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { filesToQueuedCards, useBatchStore } from "@/lib/batch-store";
import { MAX_BATCH, MIN_BATCH_TARGET } from "@/lib/sports-card";

const COMMANDS = [
  {
    id: "gigapixel",
    label: "Gigapixel",
    cmd: 'gigapixel-batch --backend gigapixel --exe "C:\\Topaz\\Gigapixel.exe" --input .\\cards --scale X2 --mode STANDARD',
  },
  {
    id: "elan",
    label: "ELAN",
    cmd: "gigapixel-batch --backend elan --checkpoint elan_x2.pt --input ./cards --resume",
  },
  {
    id: "score",
    label: "Score",
    cmd: 'card-enhance windsor.jpg  # → { "quality_reward": 2.06 }',
  },
] as const;

const FEATURES = [
  {
    n: "#1  Batch",
    title: "Bulk Enhancement",
    img: "/brand/feat_batch.jpg",
    alt: "Engraving of fanned trading cards",
    copy: "Point at a directory and a glob pattern — every matching card is upscaled, logged, and tracked with live progress and JSONL accounting.",
  },
  {
    n: "#2  Resume",
    title: "Resume Support",
    img: "/brand/feat_resume.jpg",
    alt: "Engraving of a circular arrow around a card",
    copy: "The log remembers every success. Re-run with --resume and only pending cards are processed — zero duplicated GPU hours.",
  },
  {
    n: "#3  Score",
    title: "Quality Scoring",
    img: "/brand/feat_score.jpg",
    alt: "Engraving of a balance scale weighing a card against a star",
    copy: "Extracted metadata maps to a piecewise tanh/sigmoid reward, continuous at zero. Every card earns a score between 1.0 and 2.5.",
  },
  {
    n: "#4  Automate",
    title: "GUI Automation",
    img: "/brand/feat_automate.jpg",
    alt: "Engraving of a robotic arm holding a card",
    copy: "pywinauto drives Gigapixel on Windows — open, set scale and mode, export — with retries, timeouts, and structured errors.",
  },
  {
    n: "#5  Train",
    title: "Train Your Own SR",
    img: "/brand/feat_train.jpg",
    alt: "Engraving of a node lattice growing from a card",
    copy: "A YAML-configured ELAN pipeline: ×2 upscaling, hflip and rotation augmentation, step decay, and validation on your own sets.",
  },
  {
    n: "#6  Swap",
    title: "Two Backends, One Protocol",
    img: "/brand/feat_backends.jpg",
    alt: "Engraving of two interlocking gears above a card",
    copy: "One upscaler protocol, two engines. Swap Gigapixel for ELAN with a single --backend flag — the pipeline never notices.",
  },
];

const TOOLS = [
  { to: "/", n: "01", title: "Batch", copy: "50+ sports cards, resume, ZIP" },
  { to: "/studio", n: "02", title: "Inspect", copy: "Quad crop one stubborn scan" },
  { to: "/models", n: "03", title: "Models", copy: "Live Hugging Face super-resolution" },
  { to: "/source", n: "04", title: "Source", copy: "GitHub pipeline and ELAN tree" },
];

function PipIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 0 1.5 6v12L12 24l10.5-6V6L12 0zm0 2.3 8.3 4.7L12 11.7 3.7 7 12 2.3zM3.5 9l7.5 4.3v8.2l-7.5-4.3V9zm17 0v8.2L13 21.5v-8.2L20.5 9z" />
    </svg>
  );
}

export function LandingPage() {
  const [tab, setTab] = useState<(typeof COMMANDS)[number]["id"]>("gigapixel");
  const [copied, setCopied] = useState<"cmd" | "pip" | null>(null);
  const [dropping, setDropping] = useState(false);
  const navigate = useNavigate();
  const enqueue = useBatchStore((s) => s.enqueue);
  const active = COMMANDS.find((c) => c.id === tab) ?? COMMANDS[0];

  const ingest = async (list: FileList | File[]) => {
    const queued = filesToQueuedCards(list);
    enqueue(queued);
    void navigate({ to: "/" });
  };

  const copy = async (text: string, kind: "cmd" | "pip") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 1400);
    } catch {
      setCopied(null);
    }
  };

  return (
    <div className="landing min-h-screen">
      <nav className="landing-nav">
        <a className="micro nl" href="#features">
          The Suite
        </a>
        <Link className="micro nl2" to="/score">
          Scoring
        </Link>
        <Link to="/suite" className="landing-brand">
          Card
          <br />
          Enhancer
          <small>Suite · v1.0</small>
        </Link>
        <a className="micro nr" href="#backends">
          Backends
        </a>
        <Link className="micro nr2" to="/">
          Batch {MIN_BATCH_TARGET}+ →
        </Link>
      </nav>

      <header className="landing-hero" id="install">
        <div>
          <span className="micro">Bulk sports cards &nbsp;•&nbsp; {MIN_BATCH_TARGET}+ per run</span>
          <h1>The Pipeline That Restores Your Cards</h1>

          <div className="landing-install">
            <span className="micro">Batch enhancer — {MAX_BATCH} card capacity</span>
            <div className="flex flex-wrap gap-2">
              <Link to="/" className="landing-btn">
                Open batch of {MIN_BATCH_TARGET}
              </Link>
              <Link to="/models" className="landing-btn">
                Hugging Face
              </Link>
            </div>
          </div>

          <div
            className="landing-install"
            onDragEnter={(e) => {
              e.preventDefault();
              setDropping(true);
            }}
            onDragOver={(e) => e.preventDefault()}
            onDragLeave={() => setDropping(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDropping(false);
              if (e.dataTransfer.files.length) void ingest(e.dataTransfer.files);
            }}
          >
            <span className="micro">{dropping ? "Release to queue" : "Drop a folder of scans"}</span>
            <label className="landing-btn" style={{ cursor: "pointer" }}>
              Upload 50+ cards
              <input
                type="file"
                multiple
                accept="image/*"
                className="sr-only"
                onChange={(e) => e.target.files && void ingest(e.target.files)}
              />
            </label>
          </div>

          <div className="landing-install">
            <span className="micro">Install the suite</span>
            <button type="button" className="landing-btn" onClick={() => void copy("pip install -e .", "pip")}>
              <PipIcon />
              {copied === "pip" ? "Copied to clipboard" : "pip install -e ."}
            </button>
          </div>

          <div className="landing-install">
            <span className="micro">Run from terminal</span>
            <div className="landing-term">
              <div className="landing-term-tabs">
                {COMMANDS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={tab === c.id ? "active" : ""}
                    onClick={() => setTab(c.id)}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <div className="landing-term-body">
                <code>{active.cmd}</code>
                <button type="button" className="landing-copy" onClick={() => void copy(active.cmd, "cmd")}>
                  {copied === "cmd" ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="landing-art">
          <img
            src="/brand/hero.jpg"
            alt="Engraving of a winged figure holding a restored trading card aloft, radiating light"
          />
        </div>
      </header>

      <section className="landing-demo">
        <div className="landing-demo-title micro">
          <span>enhancement_log.jsonl</span>
          <span>resume-aware</span>
        </div>
        <div className="landing-demo-frame">
          <div className="landing-demo-log">
            <span className="dim">
              {'{"input": "cards/alex_windsor.jpg",  "output": "enhanced/alex_windsor_enhanced.jpg",  "success": true}'}
            </span>
            {"\n"}
            <span className="dim">
              {'{"input": "cards/marta_keller.jpg",   "output": "enhanced/marta_keller_enhanced.jpg",   "success": true}'}
            </span>
            {"\n"}
            <span className="dim">
              {'{"input": "cards/ivo_nakamura.jpg",    "output": "enhanced/ivo_nakamura_enhanced.jpg",    "success": true}'}
            </span>
            {"\n"}
            {'{"input": "cards/sofia_reyes.jpg",     "output": "enhanced/sofia_reyes_enhanced.jpg",     "success": true}'}
            {"\n"}
            <span className="ok">Done: 128/128 succeeded in this run</span>
          </div>
        </div>
      </section>

      <section className="landing-backends" id="backends">
        <div className="landing-backend">
          <span className="micro">Topaz wrapper · Windows</span>
          <h3>Gigapixel AI</h3>
          <Link className="landing-btn" to="/">
            GUI Automation
          </Link>
        </div>
        <div className="landing-backend">
          <span className="micro">PyTorch super-resolution</span>
          <h3>ELAN</h3>
          <Link className="landing-btn" to="/source">
            Train ×2
          </Link>
        </div>
        <div className="landing-backend">
          <span className="micro">Scoring + CLI</span>
          <h3>Card Enhancer</h3>
          <Link className="landing-btn" to="/score">
            Orchestrate
          </Link>
        </div>
      </section>

      <section className="landing-tools" id="workbench">
        {TOOLS.map((t) => (
          <Link key={t.to} to={t.to} className="landing-tool">
            <span className="micro">{t.n}</span>
            <h3>{t.title}</h3>
            <p>{t.copy}</p>
          </Link>
        ))}
      </section>

      <main className="landing-panel" id="features">
        <div className="landing-panel-head">
          <img src="/brand/mark.jpg" alt="Card Enhancer Suite mark" />
          <div className="landing-note">
            <span>Feature</span>
            <span>Preview</span>
          </div>
        </div>
        <div className="landing-features">
          {FEATURES.map((f) => (
            <div key={f.title} className="landing-feature">
              <span className="micro">{f.n}</span>
              <h3>{f.title}</h3>
              <img src={f.img} alt={f.alt} />
              <p>{f.copy}</p>
            </div>
          ))}
        </div>
      </main>

      <div className="landing-wordmark" aria-hidden="true">
        <span>Enhance</span>
      </div>

      <section className="landing-scoring" id="scoring">
        <span className="micro">Metadata&nbsp;&nbsp;•&nbsp;&nbsp;Scoring&nbsp;&nbsp;•&nbsp;&nbsp;Rewards</span>
        <h2>The Truth Reward</h2>
        <p className="landing-lede">
          Name, number, manufacturer, year, stats — each field adds weight. The sum is scaled to t* and passed
          through a piecewise curve: tanh + 2 below zero, 1.5 + sigmoid at or above. Continuous, bounded, honest.
        </p>
        <Link to="/score" className="landing-btn">
          Open the scorer
        </Link>

        <div className="landing-code">
          <span className="kw">def</span> calculate_truth_reward(t_star):{"\n"}
          {"    "}
          <span className="cm">{'"""Piecewise truthfulness reward — continuous at 0."""'}</span>
          {"\n"}
          {"    "}
          <span className="kw">if</span> {"t_star < 0:"}{"\n"}
          {"        "}
          <span className="kw">return</span> tanh(t_star) + 2.0      <span className="cm"># range (1.0, 2.0)</span>
          {"\n"}
          {"    "}
          <span className="kw">return</span> 1.5 + sigmoid(t_star)        <span className="cm"># range [2.0, 2.5)</span>
          {"\n\n"}
          <span className="kw">def</span> quality_score_from_metadata(metadata):{"\n"}
          {"    "}score = 0.3·name + 0.2·number + 0.2·manufacturer{"\n"}
          {"          "}+ 0.15·year + 0.15·stats{"\n"}
          {"    "}t_star = (score - 0.5) * 4.0{"\n"}
          {"    "}
          <span className="kw">return</span> calculate_truth_reward(t_star)
        </div>

        <div className="landing-watermark">
          <img src="/brand/footer_art.jpg" alt="Engraving of an archivist examining a card through a magnifying glass" />
        </div>
      </section>

      <footer className="landing-footer">
        <div className="fl">
          <img src="/brand/mark.jpg" alt="" />
          <span className="micro">Card Enhancer Suite</span>
        </div>
        <span className="micro">MIT License &nbsp;•&nbsp; 2026</span>
      </footer>
    </div>
  );
}

export function WorkbenchLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="landing-btn">
      {children}
    </Link>
  );
}
